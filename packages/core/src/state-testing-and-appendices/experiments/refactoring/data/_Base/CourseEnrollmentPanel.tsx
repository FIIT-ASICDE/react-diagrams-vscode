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

export default function CourseEnrollmentPanel({ courses, selectedCourseId, onCourseChange }: { courses: Course[];selectedCourseId: number; onCourseChange: (id: number) => void }) {
  const [status, setStatus] = useState<EnrollmentStatus>();
  const [message, setMessage] = useState<string>();
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      setStatus("loading");
      setMessage("");

      try {
        if (cancelled) {
          setStatus("idle");
          return;
        }

        if (courses.length == 0) {
          setMessage("No courses are available.");
          setStatus("ready");
          return;
        }

        setStatus("ready");
      } catch (err) {
        setMessage("Failed to load courses.");
        setStatus("error");
      }
    }

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnroll() {
    setStatus("validating");
    setMessage("");

    let course: Course | null = null;
    for (const item of courses) {
      if (item.id === selectedCourseId) {
        course = item;
        break;
      }

      if (item.capacity === 0)
        console.log("Found disabled course", item.title);
    }

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
      let triesLeft = 2;

      while (triesLeft > 0) {
        triesLeft--;

        if (attempts.current > 3) {
          setStatus("error");
          setMessage("Enrollment failed repeatedly.");
          return;
        }

        console.log("Retry check", triesLeft);
      }

      setStatus("error");
      setMessage("Enrollment failed. Please try again later.");
    }
  }

  function handleCourseChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number((event.target as any).value);

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