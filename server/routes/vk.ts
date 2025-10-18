import { RequestHandler } from "express";

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

function toQuery(params: Record<string, any>) {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v === undefined || v === null) return acc;
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
}

async function vkCall(
  method: string,
  params: Record<string, any>,
  token: string,
) {
  const url = `${VK_API}/${method}?${toQuery({ ...params, access_token: token, v: VK_VERSION })}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (data.error) {
    const e = data.error;
    throw new Error(`VK Error ${e.error_code}: ${e.error_msg}`);
  }
  return data.response;
}

function getToken(req: any): string {
  const header = (req.headers["x-vk-token"] || req.headers["X-VK-Token"]) as
    | string
    | undefined;
  const fromBody = (req.body && (req.body.token as string)) || undefined;
  const token = header || fromBody;
  if (!token) throw new Error("Missing VK token");
  return token;
}

export const getCities: RequestHandler = async (req, res) => {
  try {
    const token = getToken(req);
    const q = (req.query.q as string) || "";
    const country_id = Number(req.query.country_id ?? 1);
    const response = await vkCall(
      "database.getCities",
      { q, country_id, need_all: 0, count: 20 },
      token,
    );
    res.json({ items: response.items ?? [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};

export const searchUsers: RequestHandler = async (req, res) => {
  try {
    const token = getToken(req);
    const {
      city_id,
      age_from,
      q,
      online,
      // Server-side filters
      min_friends,
      max_friends,
      profession,
      desired_count = 50,
      max_pages = 10,
      per_page = 50,
    } = req.body as {
      city_id?: number;
      age_from?: number;
      q?: string;
      online?: boolean;
      min_friends?: number;
      max_friends?: number;
      profession?: string;
      desired_count?: number;
      max_pages?: number;
      per_page?: number;
    };

    const collected: any[] = [];
    const rawSamples: any[] = [];
    // Use client-provided VK offset to continue scanning where client left off
    let offset = Number((req.body && (req.body.offset as number)) ?? 0);
    let calls = 0;

    function ageFromBdate(bdate?: string): number | null {
      if (!bdate) return null;
      const parts = bdate.split(".");
      if (parts.length !== 3) return null;
      const y = parseInt(parts[2], 10);
      if (!y) return null;
      const dob = new Date(
        y,
        parseInt(parts[1], 10) - 1,
        parseInt(parts[0], 10),
      );
      const age = new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970;
      return age;
    }

    function normalize(detail: any) {
      // Ensure consistent types
      const normalized: any = { ...detail };
      if (typeof normalized.can_send_friend_request === "number")
        normalized.can_send_friend_request =
          normalized.can_send_friend_request === 1;
      normalized.can_send_friend_request = !!normalized.can_send_friend_request;
      if (typeof normalized.online === "number")
        normalized.online = normalized.online === 1 ? 1 : 0;
      normalized.counters = normalized.counters || {};
      return normalized;
    }

    function passesFilters(u: any) {
      if (online && u.online !== 1) return false;
      if (u.can_send_friend_request === false) return false;
      const friends =
        u.counters && typeof u.counters.friends === "number"
          ? u.counters.friends
          : undefined;
      // If friend count filter is set, check if we have the data
      if (typeof min_friends === "number" || typeof max_friends === "number") {
        // Only enforce if we have friend data, otherwise accept (better than 0 results)
        if (typeof friends === "number") {
          if (typeof min_friends === "number" && friends < min_friends)
            return false;
          if (typeof max_friends === "number" && friends > max_friends)
            return false;
        }
        // If no friend data, allow it (some profiles don't expose this)
      }
      if (typeof age_from === "number") {
        const age = ageFromBdate(u.bdate);
        if (age !== null && age < age_from) return false;
      }
      if (profession && profession.trim()) {
        const occ = (
          u.occupation?.name ||
          u.occupation?.type ||
          ""
        ).toLowerCase();
        if (!occ.includes(profession.trim().toLowerCase())) return false;
      }
      return true;
    }

    for (
      let page = 0;
      page < Math.max(1, max_pages) && collected.length < desired_count;
      page++
    ) {
      const response = await vkCall(
        "users.search",
        {
          city: city_id,
          age_from,
          q,
          online: online ? 1 : 0,
          has_photo: 1,
          count: per_page,
          offset,
          fields: [
            "city",
            "bdate",
            "counters",
            "occupation",
            "online",
            "can_send_friend_request",
          ].join(","),
        },
        token,
      );

      calls++;
      const items = response.items ?? [];
      if (!items.length) break;

      // collect some raw samples for debugging (unfiltered)
      for (const it of items) {
        if (rawSamples.length < 3) rawSamples.push(it);
      }

      // Enrich with users.get to get reliable counters / can_send_friend_request etc.
      try {
        const ids = items.map((i: any) => i.id).filter(Boolean);
        if (ids.length) {
          const details = await vkCall(
            "users.get",
            {
              user_ids: ids.join(","),
              fields: [
                "counters",
                "occupation",
                "online",
                "can_send_friend_request",
                "is_closed",
                "can_access_closed",
                "bdate",
                "city",
                "online_app",
              ].join(","),
            },
            token,
          );
          const detailsArr = Array.isArray(details) ? details : [];
          const byId = new Map(
            detailsArr.map((d: any) => [d.id, normalize(d)]),
          );

          for (const it of items) {
            const det = byId.get(it.id) || normalize(it);
            if (passesFilters(det)) {
              collected.push(det);
              if (collected.length >= desired_count) break;
            } else {
              // Log why this user was rejected (for debugging)
              const reasons = [];
              if (online && det.online !== 1) reasons.push("not_online");
              if (det.can_send_friend_request === false)
                reasons.push("cant_send_request");
              const friends = det.counters?.friends;
              if (typeof friends === "number") {
                if (typeof min_friends === "number" && friends < min_friends)
                  reasons.push(`friends<${min_friends}`);
                if (typeof max_friends === "number" && friends > max_friends)
                  reasons.push(`friends>${max_friends}`);
              } else {
                if (
                  typeof min_friends === "number" ||
                  typeof max_friends === "number"
                )
                  reasons.push("no_friends_data");
              }
              if (rawSamples.length < 5) {
                rawSamples.push({ ...det, _rejected_reasons: reasons });
              }
            }
          }
        } else {
          // fallback to items as-is
          for (const it of items) {
            const det = normalize(it);
            if (passesFilters(det)) {
              collected.push(det);
              if (collected.length >= desired_count) break;
            }
          }
        }
      } catch (e) {
        // if enrichment fails, fallback to filtering raw items but normalize
        for (const it of items) {
          const det = normalize(it);
          if (passesFilters(det)) {
            collected.push(det);
            if (collected.length >= desired_count) break;
          }
        }
      }

      offset += items.length;
      // If fewer items returned than requested, stop early
      if (items.length < per_page) break;
    }

    res.json({
      items: collected,
      count: collected.length,
      meta: {
        vk_calls: calls,
        vk_offset: offset,
        raw_samples: rawSamples.slice(0, 3),
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};

export const addFriend: RequestHandler = async (req, res) => {
  try {
    const token = getToken(req);
    const { user_id } = req.body as { user_id: number };
    if (!user_id) throw new Error("Missing user_id");
    const response = await vkCall("friends.add", { user_id }, token);
    res.json({ result: response });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};
