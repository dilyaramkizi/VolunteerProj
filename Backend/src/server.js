const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("crypto");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });

const app = express();
const PORT = 4000;
const ROOT_DIR = path.join(__dirname, "..");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");

const ALLOWED_ROLES = ["Participant", "Coordinator"];
const ALLOWED_REGIONS = ["Almaty", "Astana"];
const ALLOWED_SHIFTS = ["Morning", "Afternoon", "Night"];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing Supabase env vars. Required: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended)."
  );
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY not found. Falling back to public key; this requires permissive table policies."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});
const upload = multer({ storage });

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    birthDate: row.birth_date,
    role: row.role,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapEventRow(row, coordinatorName = "Unknown Coordinator") {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    region: row.region,
    photoUrl: row.photo_url,
    coordinatorId: row.coordinator_id,
    coordinatorName,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

async function ensureStorage() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/api/health", async (_req, res) => {
  const { error } = await supabase.from("users").select("id").limit(1);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  return res.json({ ok: true });
});

app.get("/api/users", async (req, res) => {
  try {
    let query = supabase.from("users").select("*");
    if (req.query.role) query = query.eq("role", req.query.role);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return res.json((data || []).map(mapUserRow));
  } catch {
    return res.status(500).json({ message: "Failed to fetch users." });
  }
});

app.get("/api/users/short", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id,name,role,region,birth_date,photo_url")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json(
      (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        region: row.region,
        birthDate: row.birth_date,
        photoUrl: row.photo_url,
      }))
    );
  } catch {
    return res.status(500).json({ message: "Failed to fetch quick users." });
  }
});

app.post("/api/register", upload.single("photo"), async (req, res) => {
  try {
    const { name, region, birthDate, role } = req.body;
    if (!name || !region || !birthDate || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!req.file) return res.status(400).json({ message: "Photo is required." });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: "Invalid role selected." });
    if (!ALLOWED_REGIONS.includes(region)) return res.status(400).json({ message: "Invalid region selected." });

    const insert = {
      id: randomUUID(),
      name: String(name).trim(),
      region,
      birth_date: birthDate,
      role,
      photo_url: `/uploads/${req.file.filename}`,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("users").insert(insert).select("*").single();
    if (error) throw error;
    return res.status(201).json({ message: "Registration completed.", user: mapUserRow(data) });
  } catch {
    return res.status(500).json({ message: "Failed to register user." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { name, birthDate, role } = req.body;
    if (!name || !birthDate || !role) {
      return res.status(400).json({ message: "Name, birth date and role are required." });
    }
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: "Invalid role selected." });

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", role)
      .eq("birth_date", birthDate);
    if (error) throw error;
    const found = (data || []).find((row) => normalizeName(row.name) === normalizeName(name));
    if (!found) return res.status(401).json({ message: "User not found. Please register first." });
    return res.json({ message: "Login successful.", user: mapUserRow(found) });
  } catch {
    return res.status(500).json({ message: "Failed to login." });
  }
});

app.patch("/api/users/:userId", upload.single("photo"), async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, region, birthDate } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined && String(name).trim()) updates.name = String(name).trim();
    if (region !== undefined) {
      if (!ALLOWED_REGIONS.includes(region)) return res.status(400).json({ message: "Invalid region selected." });
      updates.region = region;
    }
    if (birthDate !== undefined && String(birthDate).trim()) updates.birth_date = birthDate;
    if (req.file) updates.photo_url = `/uploads/${req.file.filename}`;

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("*")
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: "User not found." });
    return res.json({ message: "Profile updated.", user: mapUserRow(data) });
  } catch {
    return res.status(500).json({ message: "Failed to update profile." });
  }
});

app.get("/api/events", async (_req, res) => {
  try {
    const [eventsResult, usersResult] = await Promise.all([
      supabase.from("events").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("id,name").eq("role", "Coordinator"),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (usersResult.error) throw usersResult.error;

    const coordinatorById = new Map((usersResult.data || []).map((u) => [u.id, u.name]));
    const result = (eventsResult.data || []).map((event) =>
      mapEventRow(event, coordinatorById.get(event.coordinator_id) || "Unknown Coordinator")
    );
    return res.json(result);
  } catch {
    return res.status(500).json({ message: "Failed to fetch events." });
  }
});

app.post("/api/events", upload.single("photo"), async (req, res) => {
  try {
    const { name, description, region, coordinatorId } = req.body;
    if (!name || !description || !region || !coordinatorId) {
      return res.status(400).json({ message: "All event fields are required." });
    }
    if (!req.file) return res.status(400).json({ message: "Event photo is required." });
    if (!ALLOWED_REGIONS.includes(region)) return res.status(400).json({ message: "Invalid region selected." });

    const coordinatorResult = await supabase
      .from("users")
      .select("id,name,role")
      .eq("id", coordinatorId)
      .single();
    if (coordinatorResult.error || coordinatorResult.data?.role !== "Coordinator") {
      return res.status(400).json({ message: "Coordinator account is invalid." });
    }

    const insert = {
      id: randomUUID(),
      name: String(name).trim(),
      description: String(description).trim(),
      region,
      photo_url: `/uploads/${req.file.filename}`,
      coordinator_id: coordinatorId,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("events").insert(insert).select("*").single();
    if (error) throw error;
    return res.status(201).json({
      message: "Event created successfully.",
      event: mapEventRow(data, coordinatorResult.data.name),
    });
  } catch {
    return res.status(500).json({ message: "Failed to create event." });
  }
});

app.post("/api/events/:eventId/join", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { participantId, shift } = req.body;
    if (!participantId || !shift) {
      return res.status(400).json({ message: "Participant and shift are required." });
    }
    if (!ALLOWED_SHIFTS.includes(shift)) return res.status(400).json({ message: "Invalid shift selected." });

    const [eventResult, userResult] = await Promise.all([
      supabase.from("events").select("id").eq("id", eventId).single(),
      supabase.from("users").select("id,role").eq("id", participantId).single(),
    ]);
    if (eventResult.error || !eventResult.data) return res.status(404).json({ message: "Event not found." });
    if (userResult.error || userResult.data?.role !== "Participant") {
      return res.status(400).json({ message: "Participant account is invalid." });
    }

    const existingResult = await supabase
      .from("joins")
      .select("id")
      .eq("event_id", eventId)
      .eq("participant_id", participantId)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    if (existingResult.data) {
      const { error } = await supabase
        .from("joins")
        .update({ shift, updated_at: new Date().toISOString() })
        .eq("id", existingResult.data.id);
      if (error) throw error;
      return res.json({ message: "Shift updated." });
    }

    const { error } = await supabase.from("joins").insert({
      id: randomUUID(),
      event_id: eventId,
      participant_id: participantId,
      shift,
      joined_at: new Date().toISOString(),
    });
    if (error) throw error;
    return res.json({ message: "Joined event successfully." });
  } catch {
    return res.status(500).json({ message: "Failed to join event." });
  }
});

app.patch("/api/events/:eventId", upload.single("photo"), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { name, description, region, coordinatorId } = req.body;
    if (!coordinatorId) return res.status(400).json({ message: "Coordinator is required." });

    const eventResult = await supabase.from("events").select("*").eq("id", eventId).single();
    if (eventResult.error || !eventResult.data) return res.status(404).json({ message: "Event not found." });
    if (eventResult.data.coordinator_id !== coordinatorId) {
      return res.status(403).json({ message: "You can edit only your own events." });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined && String(name).trim()) updates.name = String(name).trim();
    if (description !== undefined && String(description).trim()) updates.description = String(description).trim();
    if (region !== undefined) {
      if (!ALLOWED_REGIONS.includes(region)) return res.status(400).json({ message: "Invalid region selected." });
      updates.region = region;
    }
    if (req.file) updates.photo_url = `/uploads/${req.file.filename}`;

    const { data, error } = await supabase
      .from("events")
      .update(updates)
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) throw error;
    return res.json({ message: "Event updated.", event: mapEventRow(data) });
  } catch {
    return res.status(500).json({ message: "Failed to update event." });
  }
});

app.delete("/api/events/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { coordinatorId } = req.body || {};
    if (!coordinatorId) return res.status(400).json({ message: "Coordinator is required." });

    const eventResult = await supabase.from("events").select("*").eq("id", eventId).single();
    if (eventResult.error || !eventResult.data) return res.status(404).json({ message: "Event not found." });
    if (eventResult.data.coordinator_id !== coordinatorId) {
      return res.status(403).json({ message: "You can delete only your own events." });
    }

    await supabase.from("joins").delete().eq("event_id", eventId);
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw error;
    return res.json({ message: "Event deleted." });
  } catch {
    return res.status(500).json({ message: "Failed to delete event." });
  }
});

app.get("/api/participants/:participantId/joins", async (req, res) => {
  try {
    const { participantId } = req.params;
    const [joinsResult, eventsResult] = await Promise.all([
      supabase.from("joins").select("*").eq("participant_id", participantId),
      supabase.from("events").select("id,name,region"),
    ]);
    if (joinsResult.error) throw joinsResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const eventById = new Map((eventsResult.data || []).map((event) => [event.id, event]));
    const rows = (joinsResult.data || []).map((join) => ({
      id: join.id,
      eventId: join.event_id,
      participantId: join.participant_id,
      shift: join.shift,
      joinedAt: join.joined_at,
      updatedAt: join.updated_at || null,
      eventName: eventById.get(join.event_id)?.name || "Unknown event",
      eventRegion: eventById.get(join.event_id)?.region || "Unknown region",
    }));
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Failed to fetch participant joins." });
  }
});

app.get("/api/coordinators/:coordinatorId/participants", async (req, res) => {
  try {
    const { coordinatorId } = req.params;
    const eventsResult = await supabase.from("events").select("id,name").eq("coordinator_id", coordinatorId);
    if (eventsResult.error) throw eventsResult.error;
    const events = eventsResult.data || [];
    if (!events.length) return res.json([]);

    const eventIds = events.map((event) => event.id);
    const [joinsResult, usersResult] = await Promise.all([
      supabase.from("joins").select("*").in("event_id", eventIds),
      supabase.from("users").select("id,name").eq("role", "Participant"),
    ]);
    if (joinsResult.error) throw joinsResult.error;
    if (usersResult.error) throw usersResult.error;

    const participantById = new Map((usersResult.data || []).map((u) => [u.id, u.name]));
    const eventById = new Map(events.map((event) => [event.id, event.name]));
    const rows = (joinsResult.data || []).map((join) => ({
      joinId: join.id,
      eventId: join.event_id,
      eventName: eventById.get(join.event_id) || "Unknown event",
      participantId: join.participant_id,
      participantName: participantById.get(join.participant_id) || "Unknown participant",
      shift: join.shift,
    }));
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Failed to fetch participant list." });
  }
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize backend storage:", error);
    process.exit(1);
  });
