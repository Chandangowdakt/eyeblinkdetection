export type FrameSample = {
  t: number;
  left: number;
  right: number;
  poseValid: boolean;
  faceValid: boolean;
  counted: boolean;
};

export class FrameRecorder {
  private readonly samples: FrameSample[] = [];

  reset(): void {
    this.samples.length = 0;
  }

  push(sample: FrameSample): void {
    this.samples.push(sample);
  }

  get length(): number {
    return this.samples.length;
  }

  toCsv(): string {
    const header = "timestamp_ms,left_ear,right_ear,pose_valid,face_valid,counted";
    const body = this.samples.map((sample) =>
      [
        sample.t.toFixed(3),
        sample.left.toFixed(5),
        sample.right.toFixed(5),
        sample.poseValid ? "1" : "0",
        sample.faceValid ? "1" : "0",
        sample.counted ? "1" : "0",
      ].join(","),
    );
    return [header, ...body].join("\n");
  }

  download(filename = `blinksense-frames-${Date.now()}.csv`): void {
    const blob = new Blob([this.toCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
