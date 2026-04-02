import { createClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = ["Participant", "Coordinator"];
const ALLOWED_REGIONS = ["Almaty", "Astana"];
const ALLOWED_SHIFTS = ["Morning", "Afternoon", "Night"];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

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

async function uploadImageToSupabaseStorage(supabase, bucket, file) {
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || "*";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const bucket = env.SUPABASE_STORAGE_BUCKET || "ngo-assets";
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        const { error } = await supabase.from("users").select("id").limit(1);
        if (error) return json({ ok: false, message: error.message }, 500, origin);
        return json({ ok: true }, 200, origin);
      }

      if (request.method === "GET" && pathname === "/api/users") {
        let query = supabase.from("users").select("*");
        const role = url.searchParams.get("role");
        if (role) query = query.eq("role", role);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;
        return json((data || []).map(mapUserRow), 200, origin);
      }

      if (request.method === "GET" && pathname === "/api/users/short") {
        const { data, error } = await supabase
          .from("users")
          .select("id,name,role,region,birth_date,photo_url")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json(
          (data || []).map((row) => ({
            id: row.id,
            name: row.name,
            role: row.role,
            region: row.region,
            birthDate: row.birth_date,
            photoUrl: row.photo_url,
          })),
          200,
          origin
        );
      }

      if (request.method === "POST" && pathname === "/api/register") {
        const formData = await request.formData();
        const name = formData.get("name");
        const region = formData.get("region");
        const birthDate = formData.get("birthDate");
        const role = formData.get("role");
        const photo = formData.get("photo");

        if (!name || !region || !birthDate || !role) {
          return json({ message: "All fields are required." }, 400, origin);
        }
        if (!(photo instanceof File)) {
          return json({ message: "Photo is required." }, 400, origin);
        }
        if (!ALLOWED_ROLES.includes(String(role))) {
          return json({ message: "Invalid role selected." }, 400, origin);
        }
        if (!ALLOWED_REGIONS.includes(String(region))) {
          return json({ message: "Invalid region selected." }, 400, origin);
        }

        const photoUrl = await uploadImageToSupabaseStorage(supabase, bucket, photo);
        const insert = {
          id: crypto.randomUUID(),
          name: String(name).trim(),
          region: String(region),
          birth_date: String(birthDate),
          role: String(role),
          photo_url: photoUrl,
          created_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("users").insert(insert).select("*").single();
        if (error) throw error;
        return json({ message: "Registration completed.", user: mapUserRow(data) }, 201, origin);
      }

      if (request.method === "POST" && pathname === "/api/login") {
        const body = await request.json();
        const { name, birthDate, role } = body;
        if (!name || !birthDate || !role) {
          return json({ message: "Name, birth date and role are required." }, 400, origin);
        }
        if (!ALLOWED_ROLES.includes(String(role))) {
          return json({ message: "Invalid role selected." }, 400, origin);
        }

        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("role", role)
          .eq("birth_date", birthDate);
        if (error) throw error;
        const found = (data || []).find((row) => normalizeName(row.name) === normalizeName(name));
        if (!found) return json({ message: "User not found. Please register first." }, 401, origin);
        return json({ message: "Login successful.", user: mapUserRow(found) }, 200, origin);
      }

      if (request.method === "PATCH" && pathname.startsWith("/api/users/")) {
        const userId = pathname.split("/").pop();
        const formData = await request.formData();
        const updates = { updated_at: new Date().toISOString() };
        const name = formData.get("name");
        const region = formData.get("region");
        const birthDate = formData.get("birthDate");
        const photo = formData.get("photo");

        if (name && String(name).trim()) updates.name = String(name).trim();
        if (region) {
          if (!ALLOWED_REGIONS.includes(String(region))) {
            return json({ message: "Invalid region selected." }, 400, origin);
          }
          updates.region = String(region);
        }
        if (birthDate && String(birthDate).trim()) updates.birth_date = String(birthDate);
        if (photo instanceof File && photo.size > 0) {
          updates.photo_url = await uploadImageToSupabaseStorage(supabase, bucket, photo);
        }

        const { data, error } = await supabase
          .from("users")
          .update(updates)
          .eq("id", userId)
          .select("*")
          .single();
        if (error) throw error;
        return json({ message: "Profile updated.", user: mapUserRow(data) }, 200, origin);
      }

      if (request.method === "GET" && pathname === "/api/events") {
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
        return json(result, 200, origin);
      }

      if (request.method === "POST" && pathname === "/api/events") {
        const formData = await request.formData();
        const name = formData.get("name");
        const description = formData.get("description");
        const region = formData.get("region");
        const coordinatorId = formData.get("coordinatorId");
        const photo = formData.get("photo");

        if (!name || !description || !region || !coordinatorId) {
          return json({ message: "All event fields are required." }, 400, origin);
        }
        if (!(photo instanceof File)) {
          return json({ message: "Event photo is required." }, 400, origin);
        }
        if (!ALLOWED_REGIONS.includes(String(region))) {
          return json({ message: "Invalid region selected." }, 400, origin);
        }

        const coordinatorResult = await supabase
          .from("users")
          .select("id,name,role")
          .eq("id", coordinatorId)
          .single();
        if (coordinatorResult.error || coordinatorResult.data?.role !== "Coordinator") {
          return json({ message: "Coordinator account is invalid." }, 400, origin);
        }

        const photoUrl = await uploadImageToSupabaseStorage(supabase, bucket, photo);
        const insert = {
          id: crypto.randomUUID(),
          name: String(name).trim(),
          description: String(description).trim(),
          region: String(region),
          photo_url: photoUrl,
          coordinator_id: String(coordinatorId),
          created_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("events").insert(insert).select("*").single();
        if (error) throw error;
        return json(
          { message: "Event created successfully.", event: mapEventRow(data, coordinatorResult.data.name) },
          201,
          origin
        );
      }

      if (request.method === "POST" && /^\/api\/events\/[^/]+\/join$/.test(pathname)) {
        const eventId = pathname.split("/")[3];
        const body = await request.json();
        const { participantId, shift } = body;
        if (!participantId || !shift) {
          return json({ message: "Participant and shift are required." }, 400, origin);
        }
        if (!ALLOWED_SHIFTS.includes(String(shift))) {
          return json({ message: "Invalid shift selected." }, 400, origin);
        }

        const [eventResult, userResult] = await Promise.all([
          supabase.from("events").select("id").eq("id", eventId).single(),
          supabase.from("users").select("id,role").eq("id", participantId).single(),
        ]);
        if (eventResult.error || !eventResult.data) return json({ message: "Event not found." }, 404, origin);
        if (userResult.error || userResult.data?.role !== "Participant") {
          return json({ message: "Participant account is invalid." }, 400, origin);
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
            .update({ shift: String(shift), updated_at: new Date().toISOString() })
            .eq("id", existingResult.data.id);
          if (error) throw error;
          return json({ message: "Shift updated." }, 200, origin);
        }

        const { error } = await supabase.from("joins").insert({
          id: crypto.randomUUID(),
          event_id: eventId,
          participant_id: String(participantId),
          shift: String(shift),
          joined_at: new Date().toISOString(),
        });
        if (error) throw error;
        return json({ message: "Joined event successfully." }, 200, origin);
      }

      if (request.method === "PATCH" && pathname.startsWith("/api/events/")) {
        const eventId = pathname.split("/").pop();
        const formData = await request.formData();
        const coordinatorId = formData.get("coordinatorId");
        if (!coordinatorId) return json({ message: "Coordinator is required." }, 400, origin);

        const eventResult = await supabase.from("events").select("*").eq("id", eventId).single();
        if (eventResult.error || !eventResult.data) return json({ message: "Event not found." }, 404, origin);
        if (eventResult.data.coordinator_id !== String(coordinatorId)) {
          return json({ message: "You can edit only your own events." }, 403, origin);
        }

        const updates = { updated_at: new Date().toISOString() };
        const name = formData.get("name");
        const description = formData.get("description");
        const region = formData.get("region");
        const photo = formData.get("photo");
        if (name && String(name).trim()) updates.name = String(name).trim();
        if (description && String(description).trim()) updates.description = String(description).trim();
        if (region) {
          if (!ALLOWED_REGIONS.includes(String(region))) {
            return json({ message: "Invalid region selected." }, 400, origin);
          }
          updates.region = String(region);
        }
        if (photo instanceof File && photo.size > 0) {
          updates.photo_url = await uploadImageToSupabaseStorage(supabase, bucket, photo);
        }

        const { data, error } = await supabase
          .from("events")
          .update(updates)
          .eq("id", eventId)
          .select("*")
          .single();
        if (error) throw error;
        return json({ message: "Event updated.", event: mapEventRow(data) }, 200, origin);
      }

      if (request.method === "DELETE" && pathname.startsWith("/api/events/")) {
        const eventId = pathname.split("/").pop();
        const body = await request.json();
        const coordinatorId = body.coordinatorId;
        if (!coordinatorId) return json({ message: "Coordinator is required." }, 400, origin);

        const eventResult = await supabase.from("events").select("*").eq("id", eventId).single();
        if (eventResult.error || !eventResult.data) return json({ message: "Event not found." }, 404, origin);
        if (eventResult.data.coordinator_id !== String(coordinatorId)) {
          return json({ message: "You can delete only your own events." }, 403, origin);
        }

        await supabase.from("joins").delete().eq("event_id", eventId);
        const { error } = await supabase.from("events").delete().eq("id", eventId);
        if (error) throw error;
        return json({ message: "Event deleted." }, 200, origin);
      }

      if (request.method === "GET" && /^\/api\/participants\/[^/]+\/joins$/.test(pathname)) {
        const participantId = pathname.split("/")[3];
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
        return json(rows, 200, origin);
      }

      if (request.method === "GET" && /^\/api\/coordinators\/[^/]+\/participants$/.test(pathname)) {
        const coordinatorId = pathname.split("/")[3];
        const eventsResult = await supabase
          .from("events")
          .select("id,name")
          .eq("coordinator_id", coordinatorId);
        if (eventsResult.error) throw eventsResult.error;
        const events = eventsResult.data || [];
        if (!events.length) return json([], 200, origin);

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
        return json(rows, 200, origin);
      }

      return json({ message: "Not found." }, 404, origin);
    } catch (error) {
      return json({ message: error?.message || "Internal server error." }, 500, origin);
    }
  },
};
