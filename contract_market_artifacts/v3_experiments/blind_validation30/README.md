# V3-AB Blind Validation 30

Workflow:

1. Open `blind_validation30_review_blind.html`.
2. Fill human min/max annual salary range, confidence, role note, uncertainty note, and optional flags.
3. Export notes JSON/CSV from the blind page.
4. Only after labeling is done, use `blind_validation30_review_debug.html` or a future eval script to compare current vs V3.
5. Do not tune rules while labeling.

This is a test set, not a calibration set. Human ranges can be wide when the market is uncertain.
