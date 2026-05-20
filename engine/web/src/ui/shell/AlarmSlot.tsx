// AlarmSlot stacks the InstructorDrawer (when unlocked) above the
// priority-tiered AlarmBanner. Both read from stores directly.

import { AlarmBanner } from '../monitor/AlarmBanner';
import { InstructorDrawer } from '../instructor/InstructorDrawer';

export function AlarmSlot() {
  return (
    <>
      <InstructorDrawer />
      <AlarmBanner />
    </>
  );
}
