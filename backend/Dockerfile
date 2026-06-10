# Backend image for the ED Triage Trainer. Offline-first by default
# (LLM_PROVIDER=local needs no key/network). Install the cloud LLM extras so an
# operator can switch to a cloud provider via env without rebuilding.
FROM python:3.11-slim
WORKDIR /app

# Copy the package source before installing: hatchling (packages = ["app"]) needs
# it present, and an editable install would otherwise fail.
COPY pyproject.toml ./
COPY app ./app
COPY data ./data
RUN pip install --no-cache-dir ".[anthropic,openai]"

ENV LLM_PROVIDER=local
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
