/* Synthetic example generated and modified from real life data (react native app semestral assignment https://github.com/SimplyProgrammer/React-Native-Express-app/tree/main/frontend) */

import React, { useEffect, useMemo, useState } from "react";

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

function toSubmissionStatus(submission: Submission): SubmissionStatus {
  return submission.late ? "late" : "reviewing";
}

function toScoreInput(score: number | null): string {
  return score === null ? "" : String(score);
}

function parseScoreInput(scoreInput: string): { score?: number; error?: string } {
  if (scoreInput.trim() === "") {
    return { error: "Score is required." };
  }

  const parsedScore = Number(scoreInput);

  if (Number.isNaN(parsedScore)) {
    return { error: "Score must be a number." };
  }

  if (parsedScore > 100) {
    return { error: "Maximum score is 100." };
  }

  return { score: parsedScore };
}

function getSaveResultState(updated: Submission, parsedScore: number): { status: SubmissionStatus; feedback: string } {
  if (updated.late && parsedScore < 50) {
    return {
      status: "late",
      feedback: "Late submission saved with low score.",
    };
  }

  return {
    status: "saved",
    feedback: parsedScore >= 50 ? "Submission passed." : "Submission failed.",
  };
}

export default function StudentSubmissionManager({ selectedSubmissionId }: { selectedSubmissionId: number }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [scoreInput, setScoreInput] = useState("");
  const [feedback, setFeedback] = useState("");

  console.debug("selectedSubmissionId", selectedSubmissionId);

  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedSubmissionId) ?? null,
    [submissions, selectedSubmissionId]
  );

  function applySelection(submission: Submission) {
    setStatus(toSubmissionStatus(submission));
    setScoreInput(toScoreInput(submission.score));
  }

  function markInvalid(message: string) {
    setStatus("invalid");
    setFeedback(message);
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

        markInvalid("Selected submission was not found.");
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
      markInvalid("No submission selected.");
      return;
    }

    const parsed = parseScoreInput(scoreInput);

    if (parsed.error) {
      markInvalid(parsed.error);
      return;
    }

    const parsedScore = parsed.score as number;

    setStatus("saving");

    try {
      const updated = await saveSubmission({
        ...selected,
        score: parsedScore,
      });

      submissions.forEach((submission) => {
        if (submission.late && submission.score === null) {
          console.log("Late ungraded submission:", submission.student);
        }
      });

      setSubmissions((currentSubmissions) =>
        currentSubmissions.map((submission) => (submission.id === updated.id ? updated : submission))
      );

      const resultState = getSaveResultState(updated, parsedScore);
      setStatus(resultState.status);
      setFeedback(resultState.feedback);
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
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setScoreInput(event.target.value)}
        placeholder="Score"
      />

      <button onClick={handleSave}>Save</button>

      <p>Status: {status}</p>
      {feedback && <p>{feedback}</p>}
    </section>
  );
}
