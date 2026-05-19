//! Terminal vitals monitor.
//!
//! Subscribes to the simulation broadcast channel and renders a small
//! ratatui dashboard: numeric vitals on the left, a sparkline of `SpO2` over
//! the last 60 seconds on the right. Press `q` or `Esc` to quit.

use crate::sim::SimHandle;
use crate::wire::VitalsFrame;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Terminal,
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Sparkline},
};
use std::collections::VecDeque;
use std::io::{self, Stdout};
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

/// Run the TUI to completion (returns when the user presses `q` / `Esc` or
/// the simulation ends).
///
/// # Errors
///
/// Returns any I/O error from terminal setup/teardown. Errors are not
/// expected during steady-state rendering.
pub async fn run(handle: SimHandle) -> io::Result<()> {
    let mut terminal = setup_terminal()?;
    let mut rx = handle.subscribe();
    let mut history: VecDeque<f64> = VecDeque::with_capacity(60 * 50);

    let result = render_loop(&mut terminal, &mut rx, &mut history, handle.scenario()).await;
    teardown_terminal(&mut terminal)?;
    result
}

fn setup_terminal() -> io::Result<Terminal<CrosstermBackend<Stdout>>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    Terminal::new(backend)
}

fn teardown_terminal(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> io::Result<()> {
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    Ok(())
}

async fn render_loop(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    rx: &mut tokio::sync::broadcast::Receiver<VitalsFrame>,
    history: &mut VecDeque<f64>,
    scenario: &str,
) -> io::Result<()> {
    let mut current: Option<VitalsFrame> = None;
    loop {
        // Drain pending frames so the UI never lags behind the simulation;
        // we only need the most recent for display, plus history accumulation.
        loop {
            match rx.try_recv() {
                Ok(frame) => {
                    push_history(history, frame.spo2_fraction);
                    current = Some(frame);
                }
                Err(broadcast::TryRecvError::Empty) => break,
                Err(broadcast::TryRecvError::Lagged(_)) => {
                    // Re-sync — fine for a UI consumer.
                }
                Err(broadcast::TryRecvError::Closed) => return Ok(()),
            }
        }

        terminal.draw(|f| ui(f, scenario, current.as_ref(), history))?;

        // Poll for input at ~30 fps so the UI feels responsive but we
        // don't spin-loop. The actual data is at 50 Hz.
        if event::poll(Duration::from_millis(33))?
            && let Event::Key(key) = event::read()?
            && key.kind == KeyEventKind::Press
            && matches!(key.code, KeyCode::Char('q') | KeyCode::Esc)
        {
            return Ok(());
        }

        // Block briefly on the channel so we don't burn CPU when no events
        // and no frames are ready. The select pattern keeps the loop
        // responsive to both inputs.
        match tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {
            Ok(Ok(frame)) => {
                push_history(history, frame.spo2_fraction);
                current = Some(frame);
            }
            Ok(Err(RecvError::Closed)) => return Ok(()),
            Ok(Err(RecvError::Lagged(_))) | Err(_) => {} // resync or timeout: redraw
        }
    }
}

fn push_history(history: &mut VecDeque<f64>, spo2: f64) {
    if history.len() == history.capacity().max(1) {
        history.pop_front();
    }
    history.push_back(spo2);
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn ui(
    f: &mut ratatui::Frame<'_>,
    scenario: &str,
    frame: Option<&VitalsFrame>,
    history: &VecDeque<f64>,
) {
    let area = f.area();
    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(0),
            Constraint::Length(3),
        ])
        .split(area);

    let title = Paragraph::new(format!(
        " EMS Simulator — vitals monitor — scenario: {scenario} "
    ))
    .style(
        Style::default()
            .add_modifier(Modifier::BOLD)
            .fg(Color::Cyan),
    )
    .block(Block::default().borders(Borders::ALL));
    f.render_widget(title, outer[0]);

    let body = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(outer[1]);

    let vitals_text = match frame {
        Some(v) => {
            let spo2_color = if v.spo2_fraction >= 0.94 {
                Color::Green
            } else if v.spo2_fraction >= 0.88 {
                Color::Yellow
            } else {
                Color::Red
            };
            let hr_color = if (60.0..=100.0).contains(&v.heart_rate_bpm) {
                Color::Green
            } else if (50.0..120.0).contains(&v.heart_rate_bpm) {
                Color::Yellow
            } else {
                Color::Red
            };
            vec![
                line("t", format!("{:>7.2} s", v.sim_time_s), Color::Gray),
                line("HR", format!("{:>5.0} bpm", v.heart_rate_bpm), hr_color),
                line(
                    "SpO2",
                    format!("{:>5.1} %", v.spo2_fraction * 100.0),
                    spo2_color,
                ),
                line(
                    "RR",
                    format!("{:>5.0} /min", v.respiratory_rate_bpm),
                    Color::White,
                ),
                line("ETCO2", format!("{:>5.1} mmHg", v.etco2_mmhg), Color::White),
                line(
                    "BP",
                    format!(
                        "{:>3.0}/{:<3.0} mmHg",
                        v.systolic_bp_mmhg, v.diastolic_bp_mmhg
                    ),
                    Color::White,
                ),
                line("Temp", format!("{:>5.1} °C", v.temperature_c), Color::White),
            ]
        }
        None => vec![Line::from("waiting for first frame…")],
    };
    let vitals =
        Paragraph::new(vitals_text).block(Block::default().borders(Borders::ALL).title(" vitals "));
    f.render_widget(vitals, body[0]);

    // SpO2 sparkline scaled to 0..100% expressed in tenths-of-a-percent
    // (ratatui::Sparkline uses u64).
    let data: Vec<u64> = history
        .iter()
        .map(|f| (f.clamp(0.0, 1.0) * 1000.0) as u64)
        .collect();
    let sparkline = Sparkline::default()
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" SpO2 (last ~5 s window) "),
        )
        .data(&data)
        .max(1000)
        .style(Style::default().fg(Color::Cyan));
    f.render_widget(sparkline, body[1]);

    let footer = Paragraph::new(" press q or Esc to quit ")
        .style(Style::default().fg(Color::DarkGray))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(footer, outer[2]);
}

fn line(label: &str, value: String, color: Color) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            format!("  {label:<6}"),
            Style::default().fg(Color::DarkGray),
        ),
        Span::styled(
            value,
            Style::default().fg(color).add_modifier(Modifier::BOLD),
        ),
    ])
}

mod broadcast {
    pub use tokio::sync::broadcast::error::TryRecvError;
}
