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
  const [feedback, setFeedback] = useState<string>("");

  console.debug("selectedSubmissionId", selectedSubmissionId);
  const selected = submissions.find((submission) => submission.id === selectedSubmissionId) ?? null;

  function applySelectionState(submission: Submission) {
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

        let matched: Submission | null = null;

        for (const submission of result) {
          if (submission.id === selectedSubmissionId) {
            matched = submission;
            break;
          }

          if (submission.fileName.endsWith(".tmp")) {
            console.log("Temporary file detected");
          }
        }

        if (!matched) {
          setStatus("invalid");
          setFeedback("Selected submission was not found.");
          return;
        }

        applySelectionState(matched);
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

    applySelectionState(next);
  }

  function getValidatedScore(input: string): { score: number | null; error: string | null } {
    if (input.trim() === "") {
      return { score: null, error: "Score is required." };
    }

    const parsed = Number(input);

    if (Number.isNaN(parsed)) {
      return { score: null, error: "Score must be a number." };
    }

    if (parsed > 100) {
      return { score: null, error: "Maximum score is 100." };
    }

    return { score: parsed, error: null };
  }

  async function handleSave() {
    if (!selected) {
      setStatus("invalid");
      setFeedback("No submission selected.");
      return;
    }

    const { score: parsedScore, error } = getValidatedScore(scoreInput);

    if (error !== null || parsedScore === null) {
      setStatus("invalid");
      setFeedback(error ?? "Score is required.");
      return;
    }

    setStatus("saving");

    try {
      const updated = await saveSubmission({
        ...selected,
        score: parsedScore,
      });

      for (const current of submissions) {
        if (current.late && current.score === null) {
          console.log("Late ungraded submission:", current.student);
        }
      }

      const nextSubmissions = submissions.map((current) => {
        if (current.id === updated.id) {
          setFeedback("Updated selected submission.");
          return updated;
        }

        return current;
      });

      setSubmissions(nextSubmissions);

      if (updated.late && parsedScore < 50) {
        setStatus("late");
        setFeedback("Late submission saved with low score.");
      } else if (parsedScore >= 50) {
        setStatus("saved");
        setFeedback("Submission passed.");
      } else {
        setStatus("saved");
        setFeedback("Submission failed.");
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
