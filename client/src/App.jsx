import { useEffect, useState } from "react";

const API_BASE = "http://localhost:4000";
const STUDENT_ID = 2; // Make sure this ID exists in your DB!

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [student, setStudent] = useState(null);
  const [quiz, setQuiz] = useState("");
  const [focus, setFocus] = useState("");

  async function fetchState() {
    try {
      const res = await fetch(`${API_BASE}/student-state/${STUDENT_ID}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Student ID 2 not found in Database.");
        throw new Error("Server error.");
      }
      const data = await res.json();
      setStudent(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDailySubmit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      await fetch(`${API_BASE}/daily-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: STUDENT_ID,
          quiz_score: Number(quiz),
          focus_minutes: Number(focus),
        }),
      });
      await fetchState();
      setQuiz("");
      setFocus("");
    } catch (err) {
      alert("Failed to submit check-in");
      setLoading(false);
    }
  }

  async function completeTask() {
    try {
      setLoading(true);
      await fetch(`${API_BASE}/complete-intervention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: STUDENT_ID }),
      });
      await fetchState();
    } catch (err) {
      alert("Failed to complete task");
      setLoading(false);
    }
  }

  useEffect(() => { fetchState(); }, []);

  if (loading) return <h1 className="text-center mt-20 text-3xl">Loading...</h1>;
  
  if (error) return (
    <div className="flex justify-center mt-20">
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p className="font-bold">Error:</p>
        <p>{error}</p>
        <p className="text-sm mt-2">Run the SQL INSERT command in Neon to fix this.</p>
      </div>
    </div>
  );

  return (
    <div className="flex justify-center items-center min-h-screen bg-white">
      <div className={`border p-10 rounded-xl w-[500px] shadow-xl text-center transition-colors duration-500 
        ${student.status === 'locked' ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-300'}`}>

        <h1 className="text-3xl font-extrabold mb-4 text-black">Focus Mode</h1>

        <div className="mb-6">
           <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white uppercase
             ${student.status === 'normal' ? 'bg-green-600' : 
               student.status === 'locked' ? 'bg-red-600' : 'bg-yellow-600'}`}>
             {student.status}
           </span>
        </div>

        {/* NORMAL MODE */}
        {student.status === "normal" && (
          <form onSubmit={handleDailySubmit} className="space-y-5">
            <div>
              <label className="block text-left font-bold text-sm mb-1 text-gray-700">Daily Quiz Score</label>
              <input
                value={quiz}
                onChange={(e) => setQuiz(e.target.value)}
                placeholder="0 - 10"
                className="w-full p-3 text-lg rounded bg-white border border-gray-400 text-black"
                type="number" min="0" max="10" required
              />
            </div>

            <div>
              <label className="block text-left font-bold text-sm mb-1 text-gray-700">Focus Minutes</label>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. 120"
                className="w-full p-3 text-lg rounded bg-white border border-gray-400 text-black"
                type="number" min="0" required
              />
            </div>

            <button className="w-full bg-black text-white font-bold p-3 text-lg rounded hover:bg-gray-800 transition">
              Submit Daily Log
            </button>
          </form>
        )}

        {/* LOCKED MODE */}
        {student.status === "locked" && (
          <div className="space-y-4">
            <div className="text-6xl">⛔</div>
            <p className="font-bold text-xl text-red-700">ACCOUNT LOCKED</p>
            <p className="text-sm text-gray-700">
              You failed to meet focus goals.<br/>
              A webhook has been sent to the mentor system.<br/>
              Please wait for intervention assignment.
            </p>
            <button
              onClick={fetchState}
              className="bg-gray-400 text-black font-bold p-3 rounded w-full hover:bg-gray-500 transition"
            >
              Check for Updates ⟳
            </button>
          </div>
        )}

        {/* REMEDIAL MODE */}
        {student.status === "remedial" && student.intervention && (
          <div className="space-y-4 text-left bg-white p-5 rounded border border-yellow-300">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📌</span>
              <p className="font-bold text-xl text-black">New Task Assigned</p>
            </div>
            
            <div className="border-t pt-2">
              <p className="text-lg font-bold text-black">{student.intervention.title}</p>
              <p className="text-gray-600 mt-1">{student.intervention.description}</p>
            </div>

            <button
              onClick={completeTask}
              className="bg-green-600 text-white font-bold p-3 rounded w-full hover:bg-green-700 transition mt-4"
            >
              Mark Task Complete ✔️
            </button>
          </div>
        )}

      </div>
    </div>
  );
}