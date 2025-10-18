import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface VKCity {
  id: number;
  title: string;
}
interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  bdate?: string;
  city?: { id: number; title: string };
  occupation?: { type?: string; name?: string };
  counters?: { friends?: number };
  online?: number;
  can_send_friend_request?: boolean;
}

function parseAccessTokenFromText(text: string): string | null {
  if (!text) return null;
  const direct = text.trim();
  if (/^[a-z0-9_\-]+$/i.test(direct) && direct.length > 20) return direct;
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get("access_token");
    if (fromQuery) return fromQuery;
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const token = hash.get("access_token");
      if (token) return token;
    }
  } catch {
    const m = text.match(/access_token=([^&#\s]+)/i);
    if (m) return m[1];
  }
  return null;
}

function computeAge(bdate?: string): number | null {
  if (!bdate) return null;
  const parts = bdate.split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const dob = new Date(y, m - 1, d);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age;
}

export default function Index() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [tokenOk, setTokenOk] = useState(false);

  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<VKCity[]>([]);
  const [city, setCity] = useState<VKCity | null>(null);

  const [minAge, setMinAge] = useState(18);
  const [profession, setProfession] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(true);

  const [minFriends, setMinFriends] = useState(50);
  const [maxFriends, setMaxFriends] = useState(2000);
  const [requestsPerHour, setRequestsPerHour] = useState(40);
  const [extraDelayMs, setExtraDelayMs] = useState(2000);

  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthScopes, setOauthScopes] = useState("friends,offline");

  const [sentUserIds, setSentUserIds] = useState<Set<number>>(new Set());

  // Load sent user IDs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("vk_bot_sent_users");
      if (stored) {
        const ids = JSON.parse(stored);
        setSentUserIds(new Set(ids));
        addLog(`Загружено ${ids.length} ранее отправленных заявок`);
      }
    } catch (e) {
      console.error("Failed to load sent user IDs from localStorage:", e);
    }
  }, []);

  // Save sent user IDs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "vk_bot_sent_users",
        JSON.stringify(Array.from(sentUserIds)),
      );
    } catch (e) {
      console.error("Failed to save sent user IDs to localStorage:", e);
    }
  }, [sentUserIds]);

  useEffect(() => {
    const t = parseAccessTokenFromText(tokenInput);
    if (t) {
      setToken(t);
      setTokenOk(true);
    } else {
      setToken(null);
      setTokenOk(false);
    }
  }, [tokenInput]);

  useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((l) => [...l, `[${ts}] ${msg}`]);
  }, []);

  const fetchCities = useCallback(
    async (q: string) => {
      if (!token) return setCities([]);
      try {
        const res = await fetch(
          `/api/vk/cities?q=${encodeURIComponent(q)}&country_id=1`,
          {
            headers: { "x-vk-token": token },
          },
        );
        const data = await res.json();
        if (data.items) setCities(data.items as VKCity[]);
      } catch (e: any) {
        addLog(`Ошибка загрузки городов: ${e.message ?? e}`);
      }
    },
    [token, addLog],
  );

  useEffect(() => {
    if (!cityQuery || !token) return;
    const id = setTimeout(() => fetchCities(cityQuery), 300);
    return () => clearTimeout(id);
  }, [cityQuery, token, fetchCities]);

  // Popular Russian cities fallback and helper to resolve city id via server
  const popularCities = [
    "Москва",
    "Санкт-Петербург",
    "Новосибирск",
    "Екатеринбург",
    "Нижний Новгород",
    "Казань",
    "Челябинск",
    "Омск",
    "Самара",
    "Ростов-на-Дону",
  ];

  const fetchCityByName = useCallback(
    async (name: string) => {
      if (!token) return;
      try {
        const res = await fetch(
          `/api/vk/cities?q=${encodeURIComponent(name)}&country_id=1`,
          {
            headers: { "x-vk-token": token },
          },
        );
        const data = await res.json();
        if (data.items && data.items.length) {
          setCity(data.items[0] as VKCity);
          addLog(`Город выбран: ${data.items[0].title}`);
        } else {
          addLog(`Город не найден: ${name}`);
        }
      } catch (e: any) {
        addLog(`Ошибка поиска города: ${e.message ?? e}`);
      }
    },
    [token, addLog],
  );

  const effectiveDelay = useMemo(() => {
    const perHourDelay =
      requestsPerHour > 0 ? Math.floor(3600_000 / requestsPerHour) : 0;
    return Math.max(perHourDelay, extraDelayMs);
  }, [requestsPerHour, extraDelayMs]);

  const openOauth = useCallback(() => {
    const id = oauthClientId.trim();
    const scope = oauthScopes.trim() || "friends,offline";
    const redirect = "https://oauth.vk.com/blank.html";
    if (!id) {
      window.open(
        "https://dev.vk.com/ru/api/access-token/implicit-flow-user",
        "_blank",
      );
      return;
    }
    const url = new URL("https://oauth.vk.com/authorize");
    url.searchParams.set("client_id", id);
    url.searchParams.set("display", "page");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "token");
    url.searchParams.set("v", "5.199");
    window.open(url.toString(), "_blank");
  }, [oauthClientId, oauthScopes]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const t = parseAccessTokenFromText(text);
      if (t) {
        setTokenInput(t);
        addLog("Токен получен из буфера обмена");
      } else {
        setTokenInput(text);
        addLog("Попытка извлечения токена из вставленного текста");
      }
    } catch (e: any) {
      addLog(`Не удалось прочитать буфер обмена: ${e.message ?? e}`);
    }
  }, [addLog]);

  const nextOffsetRef = useRef(0);
  const queueRef = useRef<VKUser[]>([]);
  const [queueState, setQueueState] = useState<VKUser[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [vkCalls, setVkCalls] = useState(0);

  const fetchBatch = useCallback(
    async (opts?: {
      desired_count?: number;
      max_pages?: number;
      per_page?: number;
    }) => {
      if (!token) return [] as VKUser[];
      const body: any = {
        city_id: city?.id,
        age_from: minAge || undefined,
        q: undefined as string | undefined,
        online: onlyOnline,
        // server-side filters to avoid endless non-matching searches
        min_friends: minFriends || undefined,
        max_friends: maxFriends || undefined,
        profession: profession || undefined,
        desired_count: opts?.desired_count ?? 50,
        max_pages: opts?.max_pages ?? 8,
        per_page: opts?.per_page ?? 50,
        offset: nextOffsetRef.current,
      };
      try {
        const res = await fetch("/api/vk/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vk-token": token },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // accumulate vk_calls
        if (data.meta && typeof data.meta.vk_calls === "number") {
          setVkCalls((v) => v + data.meta.vk_calls);
        }
        const items = (data.items as VKUser[]) || [];
        // Advance offset using server-provided vk_offset when available to avoid re-scanning same VK pages
        if (data.meta && typeof data.meta.vk_offset === "number") {
          nextOffsetRef.current = data.meta.vk_offset;
        } else {
          nextOffsetRef.current += items.length;
        }
        addLog(`Найдено кандидатов: ${items.length}`);
        // Log VK calls for visibility
        if (data.meta) addLog(`VK calls: ${data.meta.vk_calls ?? 0}`);
        // Log debug info about rejected samples
        if (data.meta?.raw_samples && data.meta.raw_samples.length > 0) {
          const sample = data.meta.raw_samples[0];
          const reasons = (sample as any)?._rejected_reasons || [];
          if (reasons.length > 0) {
            addLog(
              `🔍 Отклонены: ${sample.first_name} ${sample.last_name} (${reasons.join(", ")})`,
            );
          }
        }
        return items;
      } catch (e: any) {
        addLog(`Ошибка поиска: ${e.message ?? e}`);
        return [] as VKUser[];
      }
    },
    [
      token,
      city?.id,
      minAge,
      onlyOnline,
      minFriends,
      maxFriends,
      profession,
      addLog,
    ],
  );

  const candidatePasses = useCallback(
    (u: VKUser) => {
      // Check if we've already sent a friend request to this user
      if (sentUserIds.has(u.id)) return false;

      const age = computeAge(u.bdate);
      if (minAge && age !== null && age < minAge) return false;
      if (onlyOnline && u.online !== 1) return false;
      const f =
        typeof u.counters?.friends === "number"
          ? u.counters!.friends
          : undefined;
      // If friend count filter is set, check if we have the data
      if (minFriends || maxFriends) {
        // Only enforce if we have friend data, otherwise accept (better than 0 results)
        if (typeof f === "number") {
          if (minFriends && f < minFriends) return false;
          if (maxFriends && f > maxFriends) return false;
        }
        // If no friend data, allow it (some profiles don't expose this)
      }
      if (profession.trim()) {
        const p = profession.trim().toLowerCase();
        const occ = (
          u.occupation?.name ||
          u.occupation?.type ||
          ""
        ).toLowerCase();
        if (!occ.includes(p)) return false;
      }
      // normalize can_send_friend_request: accept 1/true, reject 0/false
      if (
        u.can_send_friend_request === false ||
        u.can_send_friend_request === 0
      )
        return false;
      return true;
    },
    [minAge, onlyOnline, minFriends, maxFriends, profession, sentUserIds],
  );

  const addFriend = useCallback(
    async (user: VKUser) => {
      if (!token) return false;
      try {
        const res = await fetch("/api/vk/add-friend", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vk-token": token },
          body: JSON.stringify({ user_id: user.id }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        addLog(
          `Заявка отправлена: ${user.first_name} ${user.last_name} (id${user.id})`,
        );
        // Mark this user as sent so we don't contact them again in future sessions
        setSentUserIds((prev) => new Set([...prev, user.id]));
        setSuccessCount((s) => s + 1);
        return true;
      } catch (e: any) {
        addLog(`Ошибка отправки заявки id${user.id}: ${e.message ?? e}`);
        setErrorCount((s) => s + 1);
        return false;
      }
    },
    [token, addLog],
  );

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const start = useCallback(async () => {
    if (!token) {
      addLog("Укажите корр��ктный токен VK");
      return;
    }
    setSuccessCount(0);
    setErrorCount(0);
    setVkCalls(0);
    setRunning(true);
    runningRef.current = true;
    addLog("Бот запущен");

    const consecutiveEmptyFetches = { current: 0 };

    while (runningRef.current) {
      // Refill queue synchronously using queueRef
      if (queueRef.current.length < 5) {
        // If we've had several empty fetches, widen search parameters
        let items: VKUser[] = [];
        if (consecutiveEmptyFetches.current >= 3) {
          addLog(
            "Мало кандидатов — расширяю поиск (временно увеличиваю страницы/количество)",
          );
          items = await fetchBatch({
            desired_count: 100,
            max_pages: 20,
            per_page: 100,
          });
        } else {
          items = await fetchBatch();
        }

        const filtered = items.filter(candidatePasses);
        if (filtered.length > 0) {
          consecutiveEmptyFetches.current = 0;
          queueRef.current.push(...filtered);
          setQueueState([...queueRef.current]);
        } else {
          consecutiveEmptyFetches.current++;
        }
      }

      // Pop next candidate synchronously
      const user = queueRef.current.shift();
      setQueueState([...queueRef.current]);

      if (!user) {
        addLog("⚠️ Нет подходящих кандидатов. Проверьте фильтры:");
        if (city) addLog(`  ✓ Город: ${city.title}`);
        else addLog(`  ⚠️ Город НЕ выбран`);
        if (minAge) addLog(`  ✓ Мин. возраст: ${minAge}+`);
        if (minFriends || maxFriends)
          addLog(`  ✓ Друзья: ${minFriends || 0}-${maxFriends || "∞"}`);
        if (profession) addLog(`  ✓ Профессия: ${profession}`);
        if (onlyOnline) addLog(`  ✓ Только онлайн`);
        // Wait a bit and loop — consecutiveEmptyFetches influences next fetch
        await sleep(1500);
        continue;
      }

      await addFriend(user);
      await sleep(effectiveDelay);
    }

    addLog("Бот остановлен");
  }, [token, addLog, fetchBatch, candidatePasses, addFriend, effectiveDelay]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-accent/30">
      <header className="border-b bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-extrabold">
              VK
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Автоматизация добавления друзей VK
              </h1>
              <p className="text-xs text-muted-foreground">
                Без логина/пароля — только токен. В реальном времени показывает
                все действия.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Создано для: Дамир С��дыков
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Токен VK API</CardTitle>
              <CardDescription>
                Вставьте ссылку с токеном или сам токен — он будет распознан
                автоматически.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="token">Ссылка с токеном или токен</Label>
                  <div className="flex gap-2">
                    <Input
                      id="token"
                      placeholder="https://oauth.vk.com/blank.html#access_token=..."
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className={cn(tokenOk ? "ring-1 ring-primary/50" : "")}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={pasteFromClipboard}
                    >
                      Вставить из буфера
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tokenOk
                      ? "Токен распознан и готов к использованию"
                      : "Токен не распознан"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline">
                        Получить токен
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Получение токена (Implicit Flow)
                        </DialogTitle>
                        <DialogDescription>
                          Введите ID вашего VK приложения, выберите права и
                          откройте страницу авторизации. После выдачи токена
                          скопируйте URL из адресной строки.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label>Client ID (ID приложения VK)</Label>
                          <Input
                            placeholder="Например: 1234567"
                            value={oauthClientId}
                            onChange={(e) => setOauthClientId(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Права (scope)</Label>
                          <Input
                            placeholder="friends,offline"
                            value={oauthScopes}
                            onChange={(e) => setOauthScopes(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={openOauth}>Открыть VK OAuth</Button>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              window.open(
                                "https://dev.vk.com/ru/api/access-token/implicit-flow-user",
                                "_blank",
                              )
                            }
                          >
                            Инструкция VK
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Фильтры поиска</CardTitle>
              <CardDescription>
                Уточните параметры поиска кандидатов.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-2">
                <Label>Город</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-between">
                      {city ? city.title : "Выберите город"}
                      <span className="text-muted-foreground">(поиск)</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Начните вводить город..."
                        value={cityQuery}
                        onValueChange={setCityQuery}
                      />
                      <CommandList>
                        <CommandEmpty>Ничего не найдено</CommandEmpty>
                        <CommandGroup>
                          {cities.length > 0
                            ? cities.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={String(c.id)}
                                  onSelect={() => {
                                    addLog(`Город выбран: ${c.title}`);
                                    setCity(c);
                                    setCityQuery("");
                                  }}
                                  onPointerDown={() => {
                                    addLog(
                                      `Город выбран (pointer): ${c.title}`,
                                    );
                                    setCity(c);
                                    setCityQuery("");
                                  }}
                                >
                                  {c.title}
                                </CommandItem>
                              ))
                            : popularCities.map((name) => (
                                <CommandItem
                                  key={name}
                                  value={name}
                                  onSelect={() => {
                                    addLog(`Популярный город выбран: ${name}`);
                                    fetchCityByName(name);
                                    setCityQuery("");
                                  }}
                                  onPointerDown={() => {
                                    addLog(
                                      `Популярный го��од (pointer): ${name}`,
                                    );
                                    fetchCityByName(name);
                                    setCityQuery("");
                                  }}
                                >
                                  {name}
                                </CommandItem>
                              ))}
                        </CommandGroup>
                        <div className="px-3 pt-2 text-xs text-muted-foreground">
                          Если нужный город не найден — начните ввод и
                          попробуйте другой вариант написания (например
                          «Санкт-Петербург», «СПБ»).
                        </div>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label>Минимальный возраст: {minAge}+ </Label>
                <Slider
                  value={[minAge]}
                  min={14}
                  max={60}
                  step={1}
                  onValueChange={(v) => setMinAge(v[0])}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profession">
                  Профессия (поиск по Occupation)
                </Label>
                <Input
                  id="profession"
                  placeholder="например: дизайнер"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="grid gap-1">
                  <Label>Только онлайн</Label>
                  <span className="text-xs text-muted-foreground">
                    Искать только пользователей в сети
                  </span>
                </div>
                <Switch checked={onlyOnline} onCheckedChange={setOnlyOnline} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Управление</CardTitle>
              <CardDescription>
                Запустите или остановите отправку заявок в друзья.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={start} disabled={running} className="min-w-28">
                  Старт
                </Button>
                <Button
                  onClick={stop}
                  variant="secondary"
                  disabled={!running}
                  className="min-w-28"
                >
                  Стоп
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Настройки скорости</CardTitle>
              <CardDescription>
                Ограничения для безопасности аккаунта.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-2">
                <Label>Количество друзей у кандидата</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Минимум</Label>
                    <Input
                      type="number"
                      value={minFriends}
                      onChange={(e) =>
                        setMinFriends(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Максимум</Label>
                    <Input
                      type="number"
                      value={maxFriends}
                      onChange={(e) =>
                        setMaxFriends(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label>Заявок в час</Label>
                <Input
                  type="number"
                  value={requestsPerHour}
                  onChange={(e) =>
                    setRequestsPerHour(parseInt(e.target.value || "0", 10))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label>Доп. задержка между заявками (мс)</Label>
                <Input
                  type="number"
                  value={extraDelayMs}
                  onChange={(e) =>
                    setExtraDelayMs(parseInt(e.target.value || "0", 10))
                  }
                />
                <div className="text-xs text-muted-foreground">
                  Фактическая задержка: {effectiveDelay} мс
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="h-[280px]">
            <CardHeader>
              <CardTitle>Статистика</CardTitle>
              <CardDescription>Краткая статистика работы бота</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 text-sm">
                <div>
                  Успешных заявок: <strong>{successCount}</strong>
                </div>
                <div>
                  Ошибок: <strong>{errorCount}</strong>
                </div>
                <div>
                  VK API вызовов: <strong>{vkCalls}</strong>
                </div>
                <div className="border-t pt-2">
                  Всего контактировано (все сессии):{" "}
                  <strong>{sentUserIds.size}</strong>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setSentUserIds(new Set());
                  addLog("История отправленных заявок очищена");
                }}
              >
                Очистить историю контактов
              </Button>
            </CardContent>
          </Card>

          <Card className="h-[420px]">
            <CardHeader>
              <CardTitle>Лог действий</CardTitle>
              <CardDescription>
                Поиск, отправка заявок и ошибки в реальном времени.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                ref={logsRef}
                className="h-72 overflow-y-auto rounded-md border bg-card px-3 py-2 text-sm font-mono"
              >
                {logs.length === 0 ? (
                  <div className="text-muted-foreground">
                    Здесь будут отображаться действия бота...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setLogs([])}>
                  Очистить лог
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(logs.join("\n"))}
                >
                  Скопировать
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Только для образовательных целей. Соблюдайте правила VK и избегайте
        спама.
      </footer>
    </div>
  );
}
