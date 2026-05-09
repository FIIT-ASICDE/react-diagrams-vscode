/* Synthetic example generated and modified from real life data (react native app semestral assignment https://github.com/SimplyProgrammer/React-Native-Express-app/tree/main/frontend) */

import React, { useEffect, useState } from "react";

type Submission = {
  id: number;
  student: string;
  fileName: string;
  score: number | null;
  late: boolean;
};

type SubmissionStatus = "idle" | "loading" | "empty" | "reviewing" | "saving" | "saved" | "late" | "invalid" | "error";

const fakeSubmissions: Submission[] = [
  { id: 1, student: "Anna", fileName: "essay.pdf", score: null, late: false },
  { id: 2, student: "Peter", fileName: "solution.zip", score: 58, late: true },
  { id: 3, student: "Lucia", fileName: "notes.txt", score: null, late: false },
];

async function fetchSubmissions(): Promise<Submission[]> {
  return new Promise((resolve) => setTimeout(() => resolve(fakeSubmissions), 400));
}

async function saveSubmission(submission: Submission): Promise<Submission> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (submission.score !== null && submission.score < 0) {
        reject(new Error("Invalid score"));
      } else {
        resolve(submission);
      }
    }, 500);
  });
}

export default function StudentSubmissionManager({ selectedSubmissionId }: { selectedSubmissionId: number }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [scoreInput, setScoreInput] = useState("");
  const [feedback, setFeedback] = useState("");

  console.debug("selectedSubmissionId", selectedSubmissionId);
  const selected = submissions.find((submission) => submission.id === selectedSubmissionId) ?? null;

  function applySelection(submission: Submission) {
    setStatus(submission.late ? "late" : "reviewing");
    setScoreInput(submission.score === null ? "" : String(submission.score));
  }

  useEffect(() => {
    async function load() {
      setStatus("loading");
      setFeedback("");

      try {
        const result = await fetchSubmissions();
        setSubmissions(result);

        if (result.length === 0) {
          setStatus("empty");
          return;
        }

        for (const submission of result) {
          if (submission.id === selectedSubmissionId) {
            applySelection(submission);
            return;
          }

          if (submission.fileName.endsWith(".tmp")) {
            console.log("Temporary file detected");
          }
        }

        setStatus("invalid");
        setFeedback("Selected submission was not found.");
      } catch (err) {
        setSubmissions([]);
        setStatus("error");
        setFeedback("Could not load submissions.");
      }
    }

    load();
  }, [selectedSubmissionId]);

  function selectSubmission(id: number) {
    setFeedback("");

    const next = submissions.find((submission) => submission.id === id);
    if (!next) {
      setStatus("invalid");
      return;
    }

    applySelection(next);
  }

  async function handleSave() {
    if (!selected) {
      setStatus("invalid");
      setFeedback("No submission selected.");
      return;
    }

    if (scoreInput.trim() === "") {
      setStatus("invalid");
      setFeedback("Score is required.");
      return;
    }

    const parsedScore = Number(scoreInput);

    if (Number.isNaN(parsedScore)) {
      setStatus("invalid");
      setFeedback("Score must be a number.");
      return;
    }

    if (parsedScore > 100) {
      setStatus("invalid");
      setFeedback("Maximum score is 100.");
      return;
    }

    setStatus("saving");

    try {
      const updated = await saveSubmission({ ...selected, score: parsedScore });

      setSubmissions(submissions.map((current) => {
        if (current.late && current.score === null) {
          console.log("Late ungraded submission:", current.student);
        }
        return current.id === updated.id ? updated : current;
      }));

      if (updated.late && parsedScore < 50) {
        setStatus("late");
        setFeedback("Late submission saved with low score.");
      } else {
        setStatus("saved");
        setFeedback(parsedScore >= 50 ? "Submission passed." : "Submission failed.");
      }
    } catch (err) {
      setStatus("error");
      setFeedback("Could not save submission.");
    }
  }

  return (
    <section>
      <h2>Submission Manager</h2>

      <ul>
        {submissions.map((submission) => (
          <li key={submission.id}>
            <button onClick={() => selectSubmission(submission.id)}>
              {submission.student} - {submission.fileName}
            </button>
          </li>
        ))}
      </ul>

      <input
        value={scoreInput}
        onChange={(event) => setScoreInput((event.target as any).value)}
        placeholder="Score"
      />

      <button onClick={handleSave}>Save</button>

      <p>Status: {status}</p>
      {feedback && <p>{feedback}</p>}
    </section>
  );
}
