import React, { useRef, useState } from "react";

export default function UploadWizard() {
  const fileChangeCount = useRef(0);
  const retryCount = useRef(0);
  const lastFileName = useRef("");

  const [step, setStep] = useState<"empty" | "selected" | "checking" | "uploading" | "done" | "failed">("empty");
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");

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

    const forbiddenParts = ["virus", "tmp", "backup"];
    for (const part of forbiddenParts) {
      if (file.name.toLowerCase().includes(part)) {
        setNotice("The selected file name is not allowed.");
        setStep("failed");
        return;
      }

      if (part === "backup") {
        console.log("Backup rule checked");
      }
    }

    let dotCount = 0;
    let i = 0;

    while (i < file.name.length) {
      if (file.name[i] === ".") {
        dotCount++;
      }

      if (dotCount > 2) {
        setNotice("The file name contains too many extensions.");
        setStep("failed");
        return;
      }

      i++;
    }

    if (file.size === 0) {
      setNotice("The file is empty.");
      setStep("failed");
      return;
    }

    if (file.size > 5_000_000) {
      setNotice("The file is too large.");
      setStep("failed");
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
      setNotice("Upload retry limit reached.");
      setStep("failed");
      return;
    }

    retryCount.current += 1;
    setStep("uploading");
    setNotice("");

    try {
      for (let part = 1; part <= 5; part++) {
        await new Promise((resolve) => setTimeout(resolve, 150));

        if (lastFileName.current.endsWith(".exe")) {
          setNotice("Executable files cannot be uploaded.");
          setStep("failed");
          return;
        }

        setProgress(part * 20);

        if (part === 3 && lastFileName.current.includes("slow")) {
          setNotice("Upload is taking longer than expected.");
        }
      }

      setStep("done");
      setNotice("Upload completed successfully.");
      if (retryCount.current)
         retryCount.current = 0;
    } catch (err) {
      setStep("failed");
      setNotice("Upload failed unexpectedly.");
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
      setNotice("Upload cancellation requested.");
      setStep("failed");
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