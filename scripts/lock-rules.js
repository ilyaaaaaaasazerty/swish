/**
 * يقفل قواعد Firestore (deny all) باستخدام حساب الخدمة عبر Firebase Rules API.
 * التطبيق يعمل عبر Admin SDK الذي يتجاوز القواعد، لذا القفل لا يؤثّر على المتجر.
 *   تشغيل: node scripts/lock-rules.js
 */
const { GoogleAuth } = require("google-auth-library");

const SA = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("../service-account.json");
const PROJECT = SA.project_id;

const LOCKED_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

async function main() {
  const auth = new GoogleAuth({ credentials: SA, scopes: ["https://www.googleapis.com/auth/firebase"] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;

  // 1) إنشاء ruleset جديد
  const rs = await fetch(`${base}/rulesets`, {
    method: "POST", headers: H,
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: LOCKED_RULES }] } }),
  });
  const rsData = await rs.json();
  if (!rs.ok) throw new Error("create ruleset: " + JSON.stringify(rsData.error || rsData));
  const rulesetName = rsData.name;
  console.log("✓ ruleset:", rulesetName);

  // 2) ربط الإصدار cloud.firestore بالـ ruleset (PATCH، وإن لم يوجد ننشئه)
  const relName = `projects/${PROJECT}/releases/cloud.firestore`;
  let rel = await fetch(`https://firebaserules.googleapis.com/v1/${relName}?updateMask=rulesetName`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ name: relName, rulesetName }),
  });
  if (rel.status === 404) {
    rel = await fetch(`${base}/releases`, { method: "POST", headers: H, body: JSON.stringify({ name: relName, rulesetName }) });
  }
  const relData = await rel.json();
  if (!rel.ok) throw new Error("update release: " + JSON.stringify(relData.error || relData));
  console.log("✓ تم قفل قواعد Firestore (deny all). المتجر يعمل عبر Admin SDK.");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
