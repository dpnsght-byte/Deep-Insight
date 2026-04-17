
async function check() {
  try {
    const response = await fetch("http://localhost:3000/api/health");
    const data = await response.json();
    console.log("Health check response:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Health check failed:", err.message);
  }
}
check();
