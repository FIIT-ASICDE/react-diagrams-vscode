/* Synthetic example generated and modified from real life data (react native app semestral assignment https://github.com/SimplyProgrammer/React-Native-Express-app/tree/main/frontend) */

import React, { useEffect, useRef, useState } from "react";

type Course = {
  id: number;
  title: string;
  capacity: number;
  enrolled: number;
  requiresApproval?: boolean;
};

type EnrollmentStatus = "idle" | "loading" | "ready" | "validating" | "submitting" | "approved" | "waiting" | "rejected" | "error";

async function fakeEnroll(course: Course): Promise<{ approved: boolean }> {
  return new Promise((resolve, reject) => setTimeout(() => {
    if (course.title.includes("Broken")) reject(new Error("Enrollment failed"));
    else resolve({ approved: !course.requiresApproval });
  }, 700));
}

export default function CourseEnrollmentPanel({ courses, selectedCourseId, onCourseChange }: { courses: Course[]; selectedCourseId: number; onCourseChange: (id: number) => void }) {
  const [status, setStatus] = useState<EnrollmentStatus>();
  const [message, setMessage] = useState<string>();
  const attempts = useRef(0);

  useEffect(() => {
    setStatus("loading");
    setMessage("");

    if (courses.length === 0) {
      setMessage("No courses are available.");
    }

    setStatus("ready");
  }, []);

  async function handleEnroll() {
    setStatus("validating");
    setMessage("");

    const course = courses.find(item => item.id === selectedCourseId) ?? null;

    if (!course) {
      setMessage("Please select a course.");
      setStatus("rejected");
      return;
    }

    if (course.enrolled >= course.capacity) {
      setMessage("This course is already full.");
      setStatus("rejected");
      return;
    }

    if (attempts.current > 2) {
      setMessage("Too many enrollment attempts.");
      setStatus("error");
      return;
    }

    attempts.current++;
    setStatus("submitting");

    try {
      const result = await fakeEnroll(course);

      if (result.approved) {
        setStatus("approved");
        setMessage("You have been enrolled.");
      } else {
        setStatus("waiting");
        setMessage("Your request is waiting to approve.");
      }
    } catch (err) {
      setStatus("error");
      setMessage("Enrollment failed. Please try again later.");
    }
  }

  function handleCourseChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(event.target.value);

    onCourseChange(id);

    if (status === "error" || status === "rejected") {
      setMessage("");
      setStatus("ready");
    }

    if (attempts.current > 0)
      attempts.current = 0;
  }

  return (
    <section>
      <h2>Course Enrollment</h2>

      {status === "loading" && <p>Loading courses...</p>}

      <select
        value={selectedCourseId ?? ""}
        onChange={handleCourseChange}
        disabled={status === "loading" || status === "submitting"}
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </select>

      <button
        onClick={handleEnroll}
        disabled={status === "loading" || status === "submitting"}
      >
        {status === "submitting" ? "Submitting..." : "Enroll"}
      </button>

      <p>Status: {status}</p>
      {message && <p>{message}</p>}
      <p>Attempts: {attempts.current}</p>
    </section>
  );
}
