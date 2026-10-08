# BlinkSense

Real-time webcam blink counter using MediaPipe Face Landmarker and Eye Aspect Ratio (EAR). All inference runs in the browser at a capped 30 fps.

## Run

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5180/**, click **Start Analysis**, and allow the camera.

## Recording fixtures

Use the app's **Download frame CSV** button (not the blinks CSV). Put the files in `tests/fixtures/real/` and snapshot their detector counts without changing the detector:

```bash
npm run snapshot:real
```

That updates only `golden.real` in `tests/golden.json`. `npm test` then checks that those CSVs still produce the same counts.

Record three sessions at default settings (30 fps, count-changing flags off):

- **(A)** Sit still, 10 natural blinks, then 10 deliberate full blinks.
- **(B)** Mix 5 deliberate half-blinks among full blinks.
- **(C)** Head tilt, turn away from the camera, then cover one eye.

Name files clearly, for example `A-natural-then-full.csv`, `B-half-among-full.csv`, `C-tilt-away-one-eye.csv`.
