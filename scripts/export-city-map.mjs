#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const RENDERER_PATH = path.join(SCRIPT_DIR, "render-map.html");
const BLIP_DIR = path.join(SKILL_DIR, "assets", "blips");
const MAPLIBRE_DIR = path.join(SKILL_DIR, "node_modules", "maplibre-gl", "dist");
const MAPLIBRE_FILES = new Set([
  "maplibre-gl.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl-worker.mjs",
  "maplibre-gl.css"
]);
const CACHE_DIR = path.join(SKILL_DIR, ".cache");
const NOMINATIM_CACHE_PATH = path.join(CACHE_DIR, "nominatim-geocodes.json");
const NOMINATIM_PACING_PATH = path.join(CACHE_DIR, "nominatim-last-request.txt");

const VIEWPORT_SIZE = 3256;
const CROP_MARGIN = 128;
const OUTPUT_SIZE = 3000;
const EDGE_MARGIN = 100;
const ALL_VISIBLE_EDGE_MARGIN = 32;
const SAME_CATEGORY_DISTANCE = 360;
const GLOBAL_DISTANCE = 110;
const REQUEST_TIMEOUT_MS = 30_000;
const OVERPASS_TIMEOUT_MS = 120_000;
const RENDER_TIMEOUT_MS = 120_000;
const NOMINATIM_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USER_AGENT = "gta5-map-style-skill/2.3 (local OpenStreetMap map export)";
const NOMINATIM_URL = process.env.OSM_NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter";

const PLACE_CATEGORIES = [
  {
    id: "police",
    label: "警察",
    osmFilters: [{ key: "amenity", values: ["police"] }],
    icon: "radar_police_station.png"
  },
  {
    id: "fire",
    label: "消防",
    osmFilters: [{ key: "amenity", values: ["fire_station"] }],
    icon: "radar_fire_station.png"
  },
  {
    id: "airport",
    label: "机场",
    osmFilters: [{ key: "aeroway", values: ["aerodrome"] }],
    icon: "radar_player_plane.png",
    allVisible: true
  },
  {
    id: "train",
    label: "火车站",
    osmFilters: [
      {
        key: "railway",
        values: ["station"],
        exclude: [
          { key: "station", values: ["subway", "light_rail"] },
          { key: "subway", values: ["yes"] },
          { key: "light_rail", values: ["yes"] }
        ]
      }
    ],
    icon: "radar_train.png"
  },
  {
    id: "bus",
    label: "公交",
    osmFilters: [
      { key: "amenity", values: ["bus_station"] },
      { key: "highway", values: ["bus_stop"] }
    ],
    icon: "radar_bus.png"
  },
  {
    id: "home",
    label: "家",
    osmFilters: [{ key: "place", values: ["neighbourhood", "quarter", "suburb"] }],
    icon: "radar_safehouse.png",
    iconColor: "green"
  },
  {
    id: "hospital",
    label: "医院",
    osmFilters: [
      { key: "amenity", values: ["hospital"] },
      { key: "healthcare", values: ["hospital"] }
    ],
    icon: "radar_hospital.png"
  },
  {
    id: "bar",
    label: "酒吧",
    osmFilters: [{ key: "amenity", values: ["bar", "pub"] }],
    icon: "radar_bar.png"
  },
  {
    id: "strip-club",
    label: "脱衣舞俱乐部",
    osmFilters: [
      { key: "amenity", values: ["stripclub"] },
      { key: "adult", values: ["nightclub", "stripclub"] },
      { key: "club", values: ["strip"] }
    ],
    icon: "radar_strip_club.png"
  },
  {
    id: "vehicle-repair",
    label: "车辆修理厂",
    osmFilters: [{ key: "shop", values: ["car_repair"] }],
    icon: "radar_garage.png"
  },
  {
    id: "warehouse",
    label: "仓库",
    osmFilters: [
      { key: "building", values: ["warehouse"] },
      { key: "industrial", values: ["warehouse"] }
    ],
    icon: "radar_warehouse_vehicle.png"
  },
  {
    id: "office",
    label: "办公室",
    osmFilters: [{
      key: "office",
      values: ["company", "government", "administrative", "association", "lawyer", "financial", "coworking"]
    }],
    icon: "radar_office.png"
  },
  {
    id: "car-mod",
    label: "改装车",
    osmFilters: [{ key: "shop", values: ["car_parts", "car_accessories", "tyres"] }],
    icon: "radar_car_mod_shop.png"
  },
  {
    id: "bank-heist",
    label: "银行（可抢劫）",
    osmFilters: [{ key: "amenity", values: ["bank"] }],
    icon: "radar_finale_bank_heist.png",
    iconColor: "pale-yellow"
  },
  {
    id: "barber",
    label: "理发店",
    osmFilters: [{ key: "shop", values: ["hairdresser"] }],
    icon: "radar_barber.png"
  },
  {
    id: "amusement",
    label: "游乐场",
    osmFilters: [
      { key: "tourism", values: ["theme_park"] },
      { key: "leisure", values: ["water_park"] },
      { key: "attraction", values: ["roller_coaster"] }
    ],
    icon: "radar_fairground.png"
  },
  {
    id: "golf",
    label: "高尔夫球场",
    osmFilters: [
      { key: "leisure", values: ["golf_course"] },
      { key: "sport", values: ["golf"] }
    ],
    icon: "radar_golf.png"
  },
  {
    id: "gun-shop",
    label: "枪店",
    osmFilters: [{ key: "shop", values: ["weapons", "hunting"] }],
    icon: "radar_gun_shop.png"
  },
  {
    id: "tattoo",
    label: "纹身店",
    osmFilters: [{ key: "shop", values: ["tattoo"] }],
    icon: "radar_tattoo.png"
  },
  {
    id: "casino",
    label: "赌场",
    osmFilters: [
      { key: "amenity", values: ["casino"] },
      { key: "gambling", values: ["casino"] }
    ],
    icon: "radar_casino.png"
  },
  {
    id: "nightclub",
    label: "夜总会/夜店",
    osmFilters: [
      { key: "amenity", values: ["nightclub"] },
      { key: "club", values: ["nightclub"] },
      { key: "nightclub", values: ["yes"] }
    ],
    icon: "radar_strip_club.png"
  },
  {
    id: "raceway",
    label: "赛车场",
    osmFilters: [{ key: "highway", values: ["raceway"] }],
    icon: "radar_raceflag.png"
  },
  {
    id: "shooting-range",
    label: "射击场",
    osmFilters: [{ key: "sport", values: ["shooting"] }],
    icon: "radar_shooting_range.png"
  },
  {
    id: "marina",
    label: "码头与游艇",
    osmFilters: [
      { key: "leisure", values: ["marina"] },
      { key: "harbour", values: ["yes"] }
    ],
    icon: "radar_boat.png"
  },
  {
    id: "helipad",
    label: "直升机坪",
    osmFilters: [{ key: "aeroway", values: ["helipad"] }],
    icon: "radar_helicopter.png"
  },
  {
    id: "car-wash",
    label: "洗车场",
    osmFilters: [{ key: "amenity", values: ["car_wash"] }],
    icon: "radar_car_wash.png"
  },
  {
    id: "tennis",
    label: "网球场",
    osmFilters: [{ key: "sport", values: ["tennis"] }],
    icon: "radar_tennis.png"
  },
  {
    id: "arcade",
    label: "游戏厅",
    osmFilters: [{ key: "leisure", values: ["amusement_arcade"] }],
    icon: "radar_arcade.png"
  },
  {
    id: "car-dealer",
    label: "汽车展厅",
    osmFilters: [{ key: "shop", values: ["car"] }],
    icon: "radar_car_showroom.png"
  },
  {
    id: "lodging",
    label: "住宿",
    osmFilters: [{ key: "tourism", values: ["hotel", "motel", "hostel", "guest_house"] }],
    icon: "radar_safehouse.png"
  },
  {
    id: "shopping",
    label: "购物",
    osmFilters: [{ key: "shop", values: ["mall", "clothes", "department_store"] }],
    icon: "radar_clothes_store.png"
  },
  {
    id: "cinema",
    label: "影院",
    osmFilters: [{ key: "amenity", values: ["cinema"] }],
    icon: "radar_cinema.png"
  },
  {
    id: "tourism",
    label: "旅游文化",
    osmFilters: [
      { key: "tourism", values: ["museum", "attraction", "gallery"] },
      { key: "amenity", values: ["arts_centre"] }
    ],
    icon: "radar_vinewood_tours.png"
  },
  {
    id: "education",
    label: "教育",
    osmFilters: [{ key: "amenity", values: ["school", "university", "college"] }],
    icon: "radar_office.png"
  }
];

const RELEVANT_OSM_TAGS = new Set(
  PLACE_CATEGORIES.flatMap((category) => category.osmFilters.flatMap((filter) => [
    filter.key,
    ...(filter.exclude || []).map((excluded) => excluded.key)
  ]))
);

const ALLOWED_BLIPS = new Set(
  PLACE_CATEGORIES.map((category) => category.icon)
);

function printHelp() {
  console.log(`用法：
  node scripts/export-city-map.mjs --city "北京, 中国" [选项]

选项：
  --city <城市>       要导出的城市；重名城市请附省份、州或国家
  --latitude <纬度>   Nominatim 不可用时使用的 WGS84 城市中心纬度
  --longitude <经度>  Nominatim 不可用时使用的 WGS84 城市中心经度
  --scope <范围描述>  可选范围；多个行政区用“、”或分号分隔
  --min-range-km <数> 最小画面跨度（公里），默认 15
  --max-range-km <数> 最大画面跨度（公里），默认 80
  --output <绝对路径> PNG 输出路径，默认 outputs/<city>-gta5-map-3000.png
  --include-ofm-original
                      同时导出相同中心、缩放、范围和尺寸的 OFM Liberty 原图
  --ofm-output <路径> OFM 原图输出路径；使用后自动启用原图导出
  --seed <种子>       生成另一套可复现的地点选择
  --language <语言>   城市解析语言，默认 zh-CN
  --force             覆盖已经存在的输出文件
  --help              显示帮助

数据源：
  OpenFreeMap 矢量瓦片、OpenStreetMap 城市与地点数据。`);
}

function parseArgs(argv) {
  const options = {
    language: "zh-CN",
    force: false,
    includeOfmOriginal: false,
    minRangeKm: 15,
    maxRangeKm: 80
  };
  const valueOptions = new Map([
    ["--city", "city"],
    ["--latitude", "latitude"],
    ["--longitude", "longitude"],
    ["--scope", "scope"],
    ["--min-range-km", "minRangeKm"],
    ["--max-range-km", "maxRangeKm"],
    ["--output", "output"],
    ["--ofm-output", "ofmOutput"],
    ["--seed", "seed"],
    ["--language", "language"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--include-ofm-original") {
      options.includeOfmOriginal = true;
      continue;
    }
    if (valueOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`参数 ${argument} 缺少值`);
      options[valueOptions.get(argument)] = value;
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }
  for (const key of ["minRangeKm", "maxRangeKm"]) {
    const numeric = Number(options[key]);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`${key === "minRangeKm" ? "--min-range-km" : "--max-range-km"} 必须是正数`);
    }
    options[key] = numeric;
  }
  if (options.minRangeKm > options.maxRangeKm) {
    throw new Error("--min-range-km 不能大于 --max-range-km");
  }
  const hasLatitude = options.latitude !== undefined;
  const hasLongitude = options.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new Error("--latitude 和 --longitude 必须同时提供");
  }
  if (hasLatitude) {
    options.latitude = Number(options.latitude);
    options.longitude = Number(options.longitude);
    if (!Number.isFinite(options.latitude) || options.latitude < -90 || options.latitude > 90) {
      throw new Error("--latitude 必须是 -90 到 90 之间的数字");
    }
    if (!Number.isFinite(options.longitude) || options.longitude < -180 || options.longitude > 180) {
      throw new Error("--longitude 必须是 -180 到 180 之间的数字");
    }
  }
  return options;
}

function slugifyCity(city) {
  const slug = city
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[，,。；;、\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "city";
}

function defaultOfmOutputPath(outputPath) {
  const extension = path.extname(outputPath);
  return path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, extension)}-ofm-original${extension}`
  );
}

function normalizeSeed(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function seededRandom(seed) {
  const digest = createHash("sha256").update(seed).digest();
  let state = digest.readUInt32LE(0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function haversineKm(a, b) {
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

function calculateMapFrame(geocode, options = {}) {
  const minimumSpanKm = options.minRangeKm ?? 15;
  const maximumSpanKm = options.maxRangeKm ?? 80;
  const bounds = geocode.bounds;
  const center = bounds && options.fitBounds
    ? {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2
      }
    : { lat: geocode.location.latitude, lng: geocode.location.longitude };
  let rawSpanKm = Math.sqrt(minimumSpanKm * maximumSpanKm);
  if (bounds) {
    const horizontal = haversineKm(
      { lat: center.lat, lng: bounds.west },
      { lat: center.lat, lng: bounds.east }
    );
    const vertical = haversineKm(
      { lat: bounds.south, lng: center.lng },
      { lat: bounds.north, lng: center.lng }
    );
    rawSpanKm = Math.max(horizontal, vertical) * (options.fitBounds ? 1.08 : 0.8);
  }
  const spanKm = clamp(rawSpanKm, minimumSpanKm, maximumSpanKm);
  const metersPerPixel = spanKm * 1000 / (OUTPUT_SIZE - EDGE_MARGIN * 2);
  const latitudeFactor = Math.max(0.05, Math.cos(toRadians(center.lat)));
  const zoom = Number(clamp(
    Math.log2(latitudeFactor * 40_075_016.686 / (512 * metersPerPixel)),
    8,
    14
  ).toFixed(3));
  return {
    center,
    spanKm,
    zoom,
    minimumSpanKm,
    maximumSpanKm,
    searchRadiusMeters: Math.min(60_000, Math.max(7_500, Math.round(spanKm * 750))),
    queryBounds: boundsForOutput(center, zoom, ALL_VISIBLE_EDGE_MARGIN)
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function requestJson(url, init, label, options = {}) {
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const attempts = options.attempts || 3;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`${label}失败（HTTP ${response.status}）`);
        error.retryable = response.status === 429 || response.status >= 500;
        error.retryAfterMs = response.status === 429
          ? parseRetryAfter(response.headers.get("retry-after")) ?? 30_000
          : null;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable || error?.name === "AbortError" || error instanceof TypeError;
      if (!retryable || attempt === attempts - 1) break;
      await delay(Math.min(30_000, error?.retryAfterMs ?? 1_000 * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}失败：${message}`);
}

async function readNominatimCache() {
  try {
    const parsed = JSON.parse(await readFile(NOMINATIM_CACHE_PATH, "utf8"));
    if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === "object") return parsed;
  } catch {
    // 缓存缺失或损坏时重新请求，不影响导出。
  }
  return { version: 1, entries: {} };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function paceNominatimRequest() {
  await mkdir(CACHE_DIR, { recursive: true });
  let lastRequestAt = 0;
  try {
    lastRequestAt = Number(await readFile(NOMINATIM_PACING_PATH, "utf8")) || 0;
  } catch {
    // 第一次请求没有节流记录。
  }
  const remaining = 1_100 - (Date.now() - lastRequestAt);
  if (remaining > 0) await delay(remaining);
  await writeFile(NOMINATIM_PACING_PATH, String(Date.now()), "utf8");
}

function normalizeNominatimResult(result) {
  const boundingBox = Array.isArray(result.boundingbox) ? result.boundingbox.map(Number) : [];
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    displayName: String(result.display_name || ""),
    location: { latitude, longitude },
    bounds: boundingBox.length === 4 && boundingBox.every(Number.isFinite)
      ? { south: boundingBox[0], north: boundingBox[1], west: boundingBox[2], east: boundingBox[3] }
      : null,
    address: {
      state: String(result.address?.state || result.address?.region || ""),
      country: String(result.address?.country || ""),
      countryCode: String(result.address?.country_code || "").toUpperCase()
    }
  };
}

async function fetchNominatimResults(query, language, featureType = "city") {
  const cache = await readNominatimCache();
  const cacheKey = normalizeSeed(`${language}\u0000${featureType || "any"}\u0000${query}`);
  const cached = cache.entries[cacheKey];
  if (
    cached
    && Number.isFinite(cached.cachedAt)
    && Date.now() - cached.cachedAt < NOMINATIM_CACHE_TTL_MS
    && Array.isArray(cached.results)
  ) return cached.results;

  await paceNominatimRequest();
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  if (featureType) url.searchParams.set("featuretype", featureType);
  url.searchParams.set("accept-language", language);
  const data = await requestJson(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": language,
        "User-Agent": USER_AGENT
      }
    },
    "城市解析"
  );
  const results = (Array.isArray(data) ? data : []).map(normalizeNominatimResult).filter(Boolean);
  cache.entries[cacheKey] = { cachedAt: Date.now(), results };
  await writeJsonAtomic(NOMINATIM_CACHE_PATH, cache);
  return results;
}

function ambiguityArea(result) {
  return [result.address.countryCode, result.address.state, result.address.country]
    .map((value) => normalizeSeed(value || ""))
    .join("|");
}

async function geocodeCity(city, language) {
  const results = await fetchNominatimResults(city, language);
  if (results.length === 0) throw new Error(`无法解析城市“${city}”，请补充省份、州或国家`);
  const hasQualifier = /[,，]/.test(city);
  const distinctAreas = new Set(results.slice(0, 5).map(ambiguityArea).filter(Boolean));
  if (!hasQualifier && distinctAreas.size > 1) {
    const suggestions = results.slice(0, 3).map((result) => result.displayName).filter(Boolean).join("；");
    throw new Error(`城市“${city}”存在重名，请补充省份、州或国家${suggestions ? `。候选：${suggestions}` : ""}`);
  }
  return results[0];
}

function escapeOverpassString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function escapeOverpassRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RING_NUMERALS = {
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
  "10": "十",
  一: "一",
  二: "二",
  三: "三",
  四: "四",
  五: "五",
  六: "六",
  七: "七",
  八: "八",
  九: "九",
  十: "十"
};

function ringNumeralFromScope(scope) {
  const match = scope.normalize("NFKC").match(/(10|[1-9]|[一二三四五六七八九十])\s*环/);
  return match ? RING_NUMERALS[match[1]] : null;
}

function boundsFromOverpassElements(elements) {
  const boxes = elements
    .map((element) => element.bounds)
    .filter((bounds) => [bounds?.minlat, bounds?.maxlat, bounds?.minlon, bounds?.maxlon].every(Number.isFinite));
  if (boxes.length === 0) return null;
  return {
    south: Math.min(...boxes.map((bounds) => bounds.minlat)),
    north: Math.max(...boxes.map((bounds) => bounds.maxlat)),
    west: Math.min(...boxes.map((bounds) => bounds.minlon)),
    east: Math.max(...boxes.map((bounds) => bounds.maxlon))
  };
}

async function resolveRingScope(scope, cityGeocode) {
  const numeral = ringNumeralFromScope(scope);
  if (!numeral) return null;
  const center = cityGeocode.location;
  const namePattern = `^.*${escapeOverpassRegex(numeral)}环(东|南|西|北)?(路|高架|快速路)?$`;
  const query = `[out:json][timeout:45][maxsize:67108864];\n`
    + `way(around:120000,${center.latitude.toFixed(7)},${center.longitude.toFixed(7)})`
    + `["highway"~"^(motorway|trunk|primary)$"]["name"~"${namePattern}"];\n`
    + "out bb tags;";
  const data = await requestJson(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": USER_AGENT
      },
      body: `data=${encodeURIComponent(query)}`
    },
    "环路范围解析",
    { timeoutMs: OVERPASS_TIMEOUT_MS, attempts: 2 }
  );
  const bounds = boundsFromOverpassElements(Array.isArray(data.elements) ? data.elements : []);
  if (!bounds) return null;
  return {
    displayName: scope,
    location: {
      latitude: (bounds.south + bounds.north) / 2,
      longitude: (bounds.west + bounds.east) / 2
    },
    bounds,
    address: cityGeocode.address
  };
}

function normalizedScopeQuery(scope) {
  return scope
    .normalize("NFKC")
    .trim()
    .replace(/(?:范围)?(?:以内|之内|内)$/u, "")
    .trim();
}

async function geocodeSingleScope(scope, city, cityGeocode, language) {
  const cleanedScope = normalizedScopeQuery(scope);
  const ringScope = await resolveRingScope(cleanedScope, cityGeocode);
  if (ringScope) return ringScope;
  if (ringNumeralFromScope(cleanedScope)) {
    throw new Error(`无法在城市“${city}”附近解析环路范围“${scope}”，请使用该环路在 OpenStreetMap 中的正式名称`);
  }

  const cityToken = normalizeSeed(city.split(/[,，]/)[0]);
  const scopeQuery = normalizeSeed(cleanedScope).includes(cityToken)
    ? cleanedScope
    : `${cleanedScope}, ${city}`;
  const results = await fetchNominatimResults(scopeQuery, language, null);
  if (results.length === 0) {
    throw new Error(`无法解析范围“${scope}”，请改用可识别的行政区、环路或地标名称`);
  }
  const result = results[0];
  const distanceKm = haversineKm(
    { lat: cityGeocode.location.latitude, lng: cityGeocode.location.longitude },
    { lat: result.location.latitude, lng: result.location.longitude }
  );
  if (distanceKm > 250) {
    throw new Error(`范围“${scope}”与城市“${city}”距离过远，请补充更明确的范围描述`);
  }
  return result;
}

function splitScopeParts(scope) {
  return scope
    .normalize("NFKC")
    .split(/[、；;\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unionGeocodeBounds(results, scope) {
  if (results.some((result) => !result.bounds)) {
    throw new Error(`范围“${scope}”中至少有一个地点没有行政边界，请改用正式行政区名称`);
  }
  const bounds = {
    south: Math.min(...results.map((result) => result.bounds.south)),
    north: Math.max(...results.map((result) => result.bounds.north)),
    west: Math.min(...results.map((result) => result.bounds.west)),
    east: Math.max(...results.map((result) => result.bounds.east))
  };
  return {
    displayName: results.map((result) => result.displayName).join("；"),
    location: {
      latitude: (bounds.south + bounds.north) / 2,
      longitude: (bounds.west + bounds.east) / 2
    },
    bounds,
    address: results[0].address
  };
}

async function geocodeScope(scope, city, cityGeocode, language) {
  const parts = splitScopeParts(scope);
  if (parts.length <= 1) {
    return geocodeSingleScope(parts[0] || scope, city, cityGeocode, language);
  }
  const results = [];
  for (const part of parts) {
    results.push(await geocodeSingleScope(part, city, cityGeocode, language));
  }
  return unionGeocodeBounds(results, scope);
}

function overpassSelector(filter) {
  const key = escapeOverpassString(filter.key);
  const positive = filter.values.length === 1
    ? `["${key}"="${escapeOverpassString(filter.values[0])}"]`
    : `["${key}"~"^(${filter.values.map(escapeOverpassRegex).join("|")})$"]`;
  const exclusions = (filter.exclude || []).flatMap((excluded) => excluded.values.map((value) => (
    `["${escapeOverpassString(excluded.key)}"!="${escapeOverpassString(value)}"]`
  ))).join("");
  return `${positive}${exclusions}`;
}

function buildOverpassQuery(center, radiusMeters, bounds = null) {
  const radius = Math.round(radiusMeters);
  const latitude = center.lat.toFixed(7);
  const longitude = center.lng.toFixed(7);
  const searchArea = bounds
    ? `(${bounds.south.toFixed(7)},${bounds.west.toFixed(7)},${bounds.north.toFixed(7)},${bounds.east.toFixed(7)})`
    : `(around:${radius},${latitude},${longitude})`;
  const sections = PLACE_CATEGORIES.map((category) => {
    const selectors = category.osmFilters
      .map((filter) => `  nwr${overpassSelector(filter)}${searchArea};`)
      .join("\n");
    return `(\n${selectors}\n);\nout center${category.allVisible ? "" : " 20"};`;
  });
  return `[out:json][timeout:90][maxsize:134217728];\n${sections.join("\n")}`;
}

function normalizeOsmElements(elements) {
  const unique = new Map();
  for (const element of elements) {
    const latitude = Number(element.lat ?? element.center?.lat);
    const longitude = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !element.type || element.id == null) continue;
    const tags = {};
    for (const key of RELEVANT_OSM_TAGS) {
      if (typeof element.tags?.[key] === "string") tags[key] = element.tags[key];
    }
    const id = `${element.type}/${element.id}`;
    if (!unique.has(id)) unique.set(id, { id, lat: latitude, lng: longitude, tags });
  }
  return [...unique.values()];
}

function matchesOsmFilter(tags, filter) {
  return filter.values.includes(tags[filter.key])
    && !(filter.exclude || []).some((excluded) => excluded.values.includes(tags[excluded.key]));
}

async function fetchOsmPlaces(center, radiusMeters, bounds = null) {
  const query = buildOverpassQuery(center, radiusMeters, bounds);
  const data = await requestJson(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": USER_AGENT
      },
      body: `data=${encodeURIComponent(query)}`
    },
    "OpenStreetMap 地点查询",
    { timeoutMs: OVERPASS_TIMEOUT_MS, attempts: 2 }
  );
  const places = normalizeOsmElements(Array.isArray(data.elements) ? data.elements : []);
  return PLACE_CATEGORIES.map((category) => places
    .filter((place) => category.osmFilters.some((filter) => matchesOsmFilter(place.tags, filter)))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
    .slice(0, category.allVisible ? undefined : 20));
}

function mercatorWorldPoint(lat, lng, zoom) {
  const worldSize = 512 * 2 ** zoom;
  const sine = clamp(Math.sin(toRadians(lat)), -0.9999, 0.9999);
  return {
    x: (lng + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize,
    worldSize
  };
}

function mercatorLngLat(worldX, worldY, worldSize) {
  const longitude = worldX / worldSize * 360 - 180;
  const mercatorY = Math.PI - 2 * Math.PI * worldY / worldSize;
  const latitude = 180 / Math.PI * Math.atan(Math.sinh(mercatorY));
  return { lat: latitude, lng: longitude };
}

function boundsForOutput(center, zoom, margin = 0) {
  const centerPoint = mercatorWorldPoint(center.lat, center.lng, zoom);
  const topLeft = mercatorLngLat(
    centerPoint.x + margin - OUTPUT_SIZE / 2,
    centerPoint.y + margin - OUTPUT_SIZE / 2,
    centerPoint.worldSize
  );
  const bottomRight = mercatorLngLat(
    centerPoint.x + OUTPUT_SIZE / 2 - margin,
    centerPoint.y + OUTPUT_SIZE / 2 - margin,
    centerPoint.worldSize
  );
  return {
    south: bottomRight.lat,
    north: topLeft.lat,
    west: topLeft.lng,
    east: bottomRight.lng
  };
}

function projectToOutput(lat, lng, center, zoom) {
  const point = mercatorWorldPoint(lat, lng, zoom);
  const centerPoint = mercatorWorldPoint(center.lat, center.lng, zoom);
  let deltaX = point.x - centerPoint.x;
  if (deltaX > point.worldSize / 2) deltaX -= point.worldSize;
  if (deltaX < -point.worldSize / 2) deltaX += point.worldSize;
  return {
    x: VIEWPORT_SIZE / 2 + deltaX - CROP_MARGIN,
    y: VIEWPORT_SIZE / 2 + point.y - centerPoint.y - CROP_MARGIN
  };
}

function pixelDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function selectMarkers(categoryResults, center, zoom, baseSeed) {
  const selected = [];
  const usedPlaceIds = new Set();
  const counts = [];
  for (let index = 0; index < PLACE_CATEGORIES.length; index += 1) {
    const category = PLACE_CATEGORIES[index];
    if (category.allVisible) {
      let visibleCount = 0;
      for (const place of categoryResults[index]) {
        const pixel = projectToOutput(place.lat, place.lng, center, zoom);
        if (
          pixel.x < ALL_VISIBLE_EDGE_MARGIN
          || pixel.x > OUTPUT_SIZE - ALL_VISIBLE_EDGE_MARGIN
          || pixel.y < ALL_VISIBLE_EDGE_MARGIN
          || pixel.y > OUTPUT_SIZE - ALL_VISIBLE_EDGE_MARGIN
        ) continue;
        selected.push({
          lat: place.lat,
          lng: place.lng,
          icon: category.icon,
          iconColor: category.iconColor,
          pixel,
          category: category.id
        });
        visibleCount += 1;
      }
      counts.push({
        label: category.label,
        selected: visibleCount,
        available: categoryResults[index].length,
        allVisible: true
      });
      continue;
    }
    const random = seededRandom(`${baseSeed}\u0000${category.id}`);
    const target = random() < 0.5 ? 2 : 3;
    const candidates = shuffle(categoryResults[index], random);
    const selectedInCategory = [];
    for (const place of candidates) {
      if (selectedInCategory.length >= target) break;
      if (usedPlaceIds.has(place.id)) continue;
      const pixel = projectToOutput(place.lat, place.lng, center, zoom);
      if (
        pixel.x < EDGE_MARGIN
        || pixel.x > OUTPUT_SIZE - EDGE_MARGIN
        || pixel.y < EDGE_MARGIN
        || pixel.y > OUTPUT_SIZE - EDGE_MARGIN
      ) continue;
      if (selectedInCategory.some((marker) => pixelDistance(pixel, marker.pixel) < SAME_CATEGORY_DISTANCE)) continue;
      if (selected.some((marker) => pixelDistance(pixel, marker.pixel) < GLOBAL_DISTANCE)) continue;
      selectedInCategory.push({ pixel });
      selected.push({
        lat: place.lat,
        lng: place.lng,
        icon: category.icon,
        iconColor: category.iconColor,
        pixel,
        category: category.id
      });
      usedPlaceIds.add(place.id);
    }
    counts.push({ label: category.label, selected: selectedInCategory.length, available: candidates.length });
  }
  return { selected, counts };
}

async function assertRequiredAssets() {
  const requiredFiles = [
    ...[...ALLOWED_BLIPS].map((filename) => path.join(BLIP_DIR, filename)),
    ...[...MAPLIBRE_FILES].map((filename) => path.join(MAPLIBRE_DIR, filename))
  ];
  await Promise.all(requiredFiles.map(async (filePath) => {
    await access(filePath, fsConstants.R_OK);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error(`运行资源不是文件：${filePath}`);
  }));
}

async function startRendererServer(config) {
  const template = await readFile(RENDERER_PATH, "utf8");
  const safeJson = JSON.stringify(config).replace(/</g, "\\u003c");
  const html = template.replace("__GTA5_MAP_CONFIG_JSON__", safeJson);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/" || requestUrl.pathname === "/render-map.html") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(html);
        return;
      }
      if (requestUrl.pathname.startsWith("/vendor/")) {
        const filename = path.basename(requestUrl.pathname);
        if (!MAPLIBRE_FILES.has(filename) || requestUrl.pathname !== `/vendor/${filename}`) {
          response.writeHead(404).end();
          return;
        }
        const data = await readFile(path.join(MAPLIBRE_DIR, filename));
        const contentType = filename.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
        response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" });
        response.end(data);
        return;
      }
      if (requestUrl.pathname.startsWith("/assets/blips/")) {
        const filename = path.basename(requestUrl.pathname);
        if (!ALLOWED_BLIPS.has(filename) || requestUrl.pathname !== `/assets/blips/${filename}`) {
          response.writeHead(404).end();
          return;
        }
        const data = await readFile(path.join(BLIP_DIR, filename));
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
        response.end(data);
        return;
      }
      response.writeHead(404).end();
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function renderMap(config, tempPath) {
  const renderer = await startRendererServer(config);
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法启动系统 Google Chrome：${message}`);
    }
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_SIZE, height: VIEWPORT_SIZE },
      deviceScaleFactor: 1,
      locale: config.language
    });
    const page = await context.newPage();
    let pageError = "";
    const failedRequests = [];
    page.on("pageerror", (error) => {
      pageError = error instanceof Error ? error.message : String(error);
    });
    page.on("requestfailed", (request) => {
      if (failedRequests.length < 5) {
        failedRequests.push(`${request.url()}（${request.failure()?.errorText || "未知错误"}）`);
      }
    });
    await page.goto(renderer.url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    try {
      await page.waitForFunction(
        () => window.__MAP_READY__ === true || Boolean(window.__MAP_ERROR__),
        null,
        { timeout: RENDER_TIMEOUT_MS }
      );
    } catch {
      const rendererError = await page.evaluate(() => window.__MAP_ERROR__);
      const details = rendererError
        || pageError
        || (failedRequests.length > 0 ? `请求失败：${failedRequests.join("；")}` : "渲染页面未在限时内完成");
      throw new Error(details);
    }
    const rendererError = await page.evaluate(() => window.__MAP_ERROR__);
    if (rendererError) throw new Error(rendererError);
    if (pageError) throw new Error(`渲染页面错误：${pageError}`);
    await page.screenshot({
      path: tempPath,
      type: "png",
      clip: { x: CROP_MARGIN, y: CROP_MARGIN, width: OUTPUT_SIZE, height: OUTPUT_SIZE },
      animations: "disabled"
    });
    await context.close();
  } finally {
    await browser?.close().catch(() => {});
    await renderer.close().catch(() => {});
  }
}

async function verifyPng(filePath) {
  const header = await readFile(filePath);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (header.length < 24 || !header.subarray(0, 8).equals(pngSignature)) throw new Error("导出文件不是有效 PNG");
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width !== OUTPUT_SIZE || height !== OUTPUT_SIZE) {
    throw new Error(`导出尺寸错误：${width}×${height}，应为 ${OUTPUT_SIZE}×${OUTPUT_SIZE}`);
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function publishOutput(tempPath, outputPath, force) {
  if (force) {
    await rename(tempPath, outputPath);
    return;
  }
  try {
    await link(tempPath, outputPath);
    await unlink(tempPath);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`输出文件已经存在：${outputPath}。确认覆盖后使用 --force`);
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.city?.trim()) throw new Error("缺少 --city，请提供城市名");
  const city = options.city.trim();
  const outputPath = path.resolve(options.output || path.join(process.cwd(), "outputs", `${slugifyCity(city)}-gta5-map-3000.png`));
  const includeOfmOriginal = options.includeOfmOriginal || Boolean(options.ofmOutput);
  const ofmOutputPath = includeOfmOriginal
    ? path.resolve(options.ofmOutput || defaultOfmOutputPath(outputPath))
    : null;
  if (!outputPath.toLowerCase().endsWith(".png")) throw new Error("--output 必须使用 .png 扩展名");
  if (ofmOutputPath && !ofmOutputPath.toLowerCase().endsWith(".png")) {
    throw new Error("--ofm-output 必须使用 .png 扩展名");
  }
  if (ofmOutputPath && ofmOutputPath === outputPath) {
    throw new Error("--ofm-output 不能与 --output 使用同一路径");
  }
  const outputPaths = [outputPath, ...(ofmOutputPath ? [ofmOutputPath] : [])];
  if (!options.force) {
    for (const targetPath of outputPaths) {
      if (await pathExists(targetPath)) {
        throw new Error(`输出文件已经存在：${targetPath}。确认覆盖后使用 --force`);
      }
    }
  }

  await assertRequiredAssets();
  const usesCoordinateFallback = Number.isFinite(options.latitude) && Number.isFinite(options.longitude);
  const cityGeocode = usesCoordinateFallback
    ? {
        displayName: city,
        location: { latitude: options.latitude, longitude: options.longitude },
        bounds: null,
        address: { state: "", country: "", countryCode: "" }
      }
    : await geocodeCity(city, options.language);
  const areaGeocode = options.scope?.trim()
    ? await geocodeScope(options.scope.trim(), city, cityGeocode, options.language)
    : cityGeocode;
  const frame = calculateMapFrame(areaGeocode, {
    minRangeKm: options.minRangeKm,
    maxRangeKm: options.maxRangeKm,
    fitBounds: Boolean(options.scope?.trim())
  });
  const canonicalCity = cityGeocode.displayName || city;
  const baseSeed = normalizeSeed(options.seed || `${canonicalCity}\u0000${options.scope || ""}`);
  if (usesCoordinateFallback) {
    console.log(
      `Nominatim 城市解析已跳过：使用 WGS84 城市中心 ${options.latitude.toFixed(7)}, ${options.longitude.toFixed(7)}`
    );
  } else {
    console.log(`已解析城市：${canonicalCity}`);
  }
  if (options.scope?.trim()) console.log(`已解析范围：${areaGeocode.displayName || options.scope.trim()}`);
  console.log(
    `地图范围：约 ${frame.spanKm.toFixed(1)} 公里`
    + `（允许 ${frame.minimumSpanKm.toFixed(1)}–${frame.maximumSpanKm.toFixed(1)} 公里），缩放级别 ${frame.zoom}`
  );

  const categoryResults = await fetchOsmPlaces(frame.center, frame.searchRadiusMeters, frame.queryBounds);
  const { selected, counts } = selectMarkers(categoryResults, frame.center, frame.zoom, baseSeed);
  console.log(`地点图标：${counts.map((item) => (
    `${item.label} ${item.selected}/${item.available}${item.allVisible ? "（全部显示）" : ""}`
  )).join("，")}`);
  const config = {
    renderMode: "gta5",
    language: options.language,
    center: frame.center,
    zoom: frame.zoom,
    markers: selected.map((marker) => ({
      lat: marker.lat,
      lng: marker.lng,
      iconUrl: `/assets/blips/${marker.icon}`,
      iconColor: marker.iconColor
    }))
  };

  const renderJobs = [
    { config, outputPath },
    ...(ofmOutputPath ? [{
      config: { ...config, renderMode: "ofm-original", markers: [] },
      outputPath: ofmOutputPath
    }] : [])
  ].map((job) => ({
    ...job,
    tempPath: path.join(
      path.dirname(job.outputPath),
      `.${path.basename(job.outputPath)}.${process.pid}.${randomBytes(6).toString("hex")}.partial.png`
    )
  }));

  await Promise.all([...new Set(outputPaths.map((targetPath) => path.dirname(targetPath)))]
    .map((directory) => mkdir(directory, { recursive: true })));
  try {
    for (const job of renderJobs) {
      await renderMap(job.config, job.tempPath);
      await verifyPng(job.tempPath);
    }
    for (const job of renderJobs) {
      await publishOutput(job.tempPath, job.outputPath, options.force);
    }
  } finally {
    await Promise.all(renderJobs.map((job) => rm(job.tempPath, { force: true }).catch(() => {})));
  }
  console.log(`导出完成：${outputPath}`);
  if (ofmOutputPath) console.log(`OFM 原图导出完成：${ofmOutputPath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`错误：${message}`);
    process.exitCode = 1;
  });
}

export {
  boundsForOutput,
  buildOverpassQuery,
  calculateMapFrame,
  defaultOfmOutputPath,
  fetchOsmPlaces,
  geocodeCity,
  geocodeScope,
  parseArgs,
  projectToOutput,
  seededRandom,
  selectMarkers,
  splitScopeParts,
  slugifyCity
};
