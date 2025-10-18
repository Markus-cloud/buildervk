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

async function vkCall(method: string, params: Record<string, any>, token: string) {
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
  const header = (req.headers["x-vk-token"] || req.headers["X-VK-Token"]) as string | undefined;
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
      count = 50,
      offset = 0,
    } = req.body as {
      city_id?: number;
      age_from?: number;
      q?: string;
      online?: boolean;
      count?: number;
      offset?: number;
    };

    const response = await vkCall(
      "users.search",
      {
        city: city_id,
        age_from,
        q,
        online: online ? 1 : 0,
        has_photo: 1,
        count,
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
    res.json({ items: response.items ?? [], count: response.count ?? 0 });
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
