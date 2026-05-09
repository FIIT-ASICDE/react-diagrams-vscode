import React, { useRef, useState } from "react";

type Step = "empty" | "selected" | "checking" | "uploading" | "done" | "failed";

const FORBIDDEN_PARTS = ["virus", "tmp", "backup"];

export default function UploadWizard() {
  const fileChangeCount = useRef(0);
  const retryCount = useRef(0);
  const lastFileName = useRef("");

  const [step, setStep] = useState<Step>("empty");
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");

  const failWithNotice = (message: string) => {
    setNotice(message);
    setStep("failed");
  };

  const hasTooManyExtensions = (fileName: string) => {
    let dotCount = 0;
    for (const ch of fileName) {
      if (ch === ".") {
        dotCount += 1;
        if (dotCount > 2) {
          return true;
        }
      }
    }
    return false;
  };

  const validateFile = (file: File): string | null => {
    const lowerName = file.name.toLowerCase();

    for (const part of FORBIDDEN_PARTS) {
      if (lowerName.includes(part)) {
        return "The selected file name is not allowed.";
      }
      if (part === "backup") {
        console.log("Backup rule checked");
      }
    }

    if (hasTooManyExtensions(file.name)) {
      return "The file name contains too many extensions.";
    }

    if (file.size === 0) {
      return "The file is empty.";
    }

    if (file.size > 5_000_000) {
      return "The file is too large.";
    }

    return null;
  };

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    fileChangeCount.current += 1;

    setNotice("");
    setProgress(0);

    if (!file) {
      setStep("empty");
      return;
    }

    lastFileName.current = file.name;
    setStep("checking");

    const validationError = validateFile(file);
    if (validationError) {
      failWithNotice(validationError);
      return;
    }

    setStep("selected");
  }

  async function startUpload() {
    if (step !== "selected" && step !== "failed") {
      setNotice("Please select a valid file first.");
      return;
    }

    if (retryCount.current > 2) {
      failWithNotice("Upload retry limit reached.");
      return;
    }

    retryCount.current += 1;
    setStep("uploading");
    setNotice("");

    try {
      for (let part = 1; part <= 5; part += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));

        if (lastFileName.current.endsWith(".exe")) {
          failWithNotice("Executable files cannot be uploaded.");
          return;
        }

        setProgress(part * 20);

        if (part === 3 && lastFileName.current.includes("slow")) {
          setNotice("Upload is taking longer than expected.");
        }
      }

      setStep("done");
      setNotice("Upload completed successfully.");
      retryCount.current = 0;
    } catch {
      failWithNotice("Upload failed unexpectedly.");
    }
  }

  function resetWizard() {
    setStep("empty");
    setProgress(0);
    setNotice("");
    retryCount.current = 0;
    lastFileName.current = "";
  }

  function handleCancel() {
    if (step === "uploading") {
      failWithNotice("Upload cancellation requested.");
      return;
    }

    if (step === "done") {
      resetWizard();
      return;
    }

    setNotice("");
    setStep("empty");
  }

  return (
    <section>
      <h2>Upload Wizard</h2>

      <input
        type="file"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <button onClick={startUpload}>Start Upload</button>
      <button onClick={handleCancel}>Cancel</button>
      <button onClick={resetWizard}>Reset</button>

      <p>Step: {step}</p>
      <p>Progress: {progress}%</p>
      {notice && <p>{notice}</p>}
    </section>
  );
}
