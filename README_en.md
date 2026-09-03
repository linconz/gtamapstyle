# 🗺️ GTA 5 Map Style Skill

[中文](README.md) | English |  [GTA 5 Style's Map Example](example.md)

Export any real-world city as a 3000×3000 PNG in the style of the GTA 5 map. The map uses OpenFreeMap and OpenStreetMap data, hides road names, administrative labels, and ordinary place labels, and renders the city with black land, layered gray and white roads, muted blue water, and GTA 5 location icons.

This repository is a GitHub-publishable Agent Skill for Codex, Claude Code, and WorkBuddy. The canonical skill uses the portable `SKILL.md` structure; installation paths, explicit invocation syntax, and distribution methods are documented separately for each platform.

## ✨ Features

- Generate a real-world map from any city name.
- Control the map area with natural-language descriptions such as “Hong Kong's main Kowloon districts,” “Wan Chai District,” or “centered on Victoria Harbour.”
- Set minimum and maximum geographic spans in natural language and let the Agent select a suitable value between them.
- Request an additional OpenFreeMap Liberty image covering exactly the same area as the GTA-style output.
- Export an exact 3000×3000 PNG without a city title, GTA logo, or map labels.
- Mark real locations such as police stations, hospitals, airports, railway stations, bars, vehicle repair shops, banks, gun shops, casinos, race tracks, marinas, and helipads with GTA 5-style icons.
- Use deterministic sparse icon placement to reduce clutter. The same city and seed reproduce the same layout.

## 🧰 Requirements

- Codex, Claude Code, or a WorkBuddy environment that can run custom skill scripts.
- Node.js 20 or later.
- Google Chrome.
- Network access to OpenFreeMap, Nominatim, and Overpass.

Install the dependencies:

```bash
npm ci --omit=dev
```

## 💻 Install on Codex

### 📦 Skill Installer

Enter the following in Codex:

```text
$skill-installer Install gta5-map-style from https://github.com/linconz/gtamapstyle
```

Restart Codex if the skill does not appear immediately after installation.

### 👤 Personal Installation

A personal skill is available in all your projects:

```bash
git clone https://github.com/linconz/gtamapstyle.git "$HOME/.agents/skills/gta5-map-style"
npm --prefix "$HOME/.agents/skills/gta5-map-style" ci --omit=dev
```

### 🗂️ Project Installation

Run the following from the root of the target Git repository:

```bash
mkdir -p .agents/skills
git submodule add https://github.com/linconz/gtamapstyle.git .agents/skills/gta5-map-style
npm --prefix .agents/skills/gta5-map-style ci --omit=dev
```

A project-level installation makes the skill discoverable to other users of that repository. Codex scans `.agents/skills` while walking from the current directory toward the repository root.

Codex explicit invocation starts with `$`:

```text
$gta5-map-style Generate a map of Hong Kong.
```

## 🧠 Install and Use on Claude Code

Claude Code discovers skills in personal or project skill directories. The directory name `gta5-map-style` also becomes the slash-command name. See the [official Claude Code Skills documentation](https://code.claude.com/docs/en/slash-commands).

### 👤 Personal Installation

Install once and use the skill in all Claude Code projects:

```bash
git clone https://github.com/linconz/gtamapstyle.git "$HOME/.claude/skills/gta5-map-style"
npm --prefix "$HOME/.claude/skills/gta5-map-style" ci --omit=dev
```

### 🗂️ Project Installation

Run this from the root of the target Git repository:

```bash
mkdir -p .claude/skills
git submodule add https://github.com/linconz/gtamapstyle.git .claude/skills/gta5-map-style
npm --prefix .claude/skills/gta5-map-style ci --omit=dev
```

Invoke it explicitly in Claude Code:

```text
/gta5-map-style Generate a map of Hong Kong.
```

You can also ask Claude to “generate a GTA 5-style map of Hong Kong” and let it select the skill from its description.

## 🛠️ Install and Use on WorkBuddy

WorkBuddy custom skills are uploaded as ZIP archives. Every GitHub Release provides a prebuilt, verified installation package with WorkBuddy's required `skills/<skill-name>/SKILL.md` layout and localized names, descriptions, version, author, and tool-permission metadata. See the [official WorkBuddy Skill documentation](https://open.workbuddy.cn/docs/skill).

[Download the latest WorkBuddy installation package](https://github.com/linconz/gtamapstyle/releases/latest/download/gta5-map-style-workbuddy.zip)

Installation steps:

1. Download `gta5-map-style-workbuddy.zip` without extracting it.
2. In the WorkBuddy Open Platform, choose “Add Skill,” then “Create Skill.”
3. Upload the downloaded ZIP and finish the installation.

Users do not need to clone the repository or run a packaging command. After the skill is published to the marketplace, other users can install it from the Skills page under WorkBuddy's Experts, Skills, and Connectors section.

Name the skill in a natural-language WorkBuddy conversation:

```text
Use the gta5-map-style skill to generate a GTA 5-style map of Kowloon and the northern shore of Hong Kong Island, then export a matching OFM reference image.
```

The WorkBuddy execution environment must still provide Node.js 20+, npm, Google Chrome, and network access to the map services. The skill installs its locked dependencies on first use when needed.

## 🔄 Use the Skill Across Platforms

Natural language is the portable invocation method and does not depend on one Agent's command syntax:

```text
Use the installed gta5-map-style skill to generate a 3000×3000 GTA 5-style map of Paris.
```

Platform-specific explicit or recommended forms are:

| Agent | Invocation |
|---|---|
| Codex | `$gta5-map-style Generate a map of Hong Kong.` |
| Claude Code | `/gta5-map-style Generate a map of Hong Kong.` |
| WorkBuddy | `Use the gta5-map-style skill to generate a map of Hong Kong.` |
| Other Agent Skills-compatible agents | Name `gta5-map-style` in natural language, or use that Agent's own skill-command syntax |

The skill also supports implicit invocation. A clear request for a GTA 5-style city map is enough for an Agent with automatic skill matching to select it:

```text
Generate a 3000×3000 GTA 5-style map of Paris.
```

Add a state, province, or country when a city name is ambiguous:

```text
Generate a GTA 5-style map of London, United Kingdom.
```

By default, the output is saved in the current workspace as:

```text
outputs/<city>-gta5-map-3000.png
```

If you also request the original OFM map, it is saved beside the GTA output as:

```text
outputs/<city>-gta5-map-3000-ofm-original.png
```

## 🗣️ Control the Map Area with Natural Language

### 🌆 Entire City

```text
Generate a map of Tokyo and choose a balanced area that clearly represents the central city.
```

### 🔁 Core Urban Area

```text
Generate a map of Hong Kong focused on Kowloon and the northern shore of Hong Kong Island.
```

The Agent derives the map center and geographic span from the requested core districts while keeping the main roads and coastline in view.

### 🏙️ Administrative District or Urban Area

```text
Generate a GTA 5-style map of Wan Chai District, Hong Kong, showing only Wan Chai and its main roads.
```

```text
Generate a GTA 5-style map of Manhattan, New York.
```

Separate multiple administrative districts with semicolons. The Agent resolves their official names and uses their combined boundary:

```text
Regenerate the Hong Kong map and limit it to Sham Shui Po; Wong Tai Sin; Kwun Tong; Kowloon City; Yau Tsim Mong; Central and Western; Wan Chai; and Eastern District.
```

### 📍 Centered on a Landmark

```text
Generate a map of Paris centered on the Eiffel Tower and include the surrounding central districts.
```

```text
Generate a map of Hong Kong centered on Victoria Harbour with a geographic span between 20 and 30 kilometers.
```

### 📏 Minimum and Maximum Span

```text
Generate a map of Hong Kong. Keep the geographic span between 20 and 45 kilometers and choose a balanced value within that range.
```

Distances describe the real geographic span of the finished image, not a map zoom level.

### 🎲 Reproducible Alternative Layout

```text
Regenerate the Kowloon and northern Hong Kong Island map with the seed "hong-kong-night". Use a different icon layout that can be reproduced later.
```

### 📁 Custom Output Location

```text
Generate a GTA 5-style map of central Hong Kong and save it to artwork/hong-kong-map.png.
```

### 🌓 Matching OFM Reference Image

```text
Generate a GTA 5-style map of Seoul and also export an OFM reference image with exactly the same area and dimensions.
```

You can also specify separate paths for both images:

```text
Generate a GTA 5-style map of Kowloon and the northern shore of Hong Kong Island, then export the matching OFM image. Save the GTA map to outputs/hong-kong-gta5.png and the OFM image to outputs/hong-kong-ofm.png.
```

Both images use the same center and zoom. Each is rendered at 3256×3256, cropped by 128 pixels on every side, and exported as an exact 3000×3000 image. The cropped output does not contain the bottom-right footer notice.

### ✅ Complete Example

```text
Generate a GTA 5-style map of Kowloon and the northern shore of Hong Kong Island. Keep the geographic span between 20 and 35 kilometers and choose a balanced value within that range. Include real airports, railway stations, hospitals, police stations, bars, vehicle services, gun shops, casinos, race tracks, and other GTA activity icons. Export an exact 3000×3000 PNG to outputs/hong-kong-urban-core.png.
```

## 🧠 How the Agent Interprets Requests

| Natural-language input | Agent behavior |
|---|---|
| “Hong Kong” | Resolve the city center and city boundary |
| “Kowloon and northern Hong Kong Island” | Resolve the requested core urban area |
| “Wan Chai District” | Resolve an administrative district boundary |
| “Centered on Victoria Harbour” | Use the landmark result as the map center |
| “At least 20 km and no more than 40 km” | Set the permitted minimum and maximum geographic span |
| “Use seed night” | Generate a different reproducible location selection |
| “Save to artwork/map.png” | Use the requested output path |
| “Also export the matching OFM map” | Add an official Liberty-style reference image using the same center, zoom, and crop |
| “Save the OFM image to outputs/original.png” | Use the requested path for the reference image |

If the user does not provide a city, the Agent asks for one. If a city name cannot be resolved unambiguously, the Agent asks for a state, province, or country.

## ⚙️ Run the Exporter Directly

You can also run the underlying script without an Agent:

```bash
node scripts/export-city-map.mjs \
  --city "Hong Kong" \
  --scope "Kowloon; northern Hong Kong Island" \
  --min-range-km 20 \
  --max-range-km 35 \
  --output "$PWD/outputs/hong-kong-urban-core.png" \
  --include-ofm-original \
  --ofm-output "$PWD/outputs/hong-kong-urban-core-ofm.png" \
  --language "en"
```

Options:

| Option | Description |
|---|---|
| `--city <city>` | Required. Add a state, province, or country when the name is ambiguous |
| `--scope <area>` | Administrative district, ring road, urban area, or landmark; separate multiple districts with semicolons |
| `--min-range-km <kilometers>` | Minimum geographic span; defaults to 15 |
| `--max-range-km <kilometers>` | Maximum geographic span; defaults to 80 |
| `--output <path>` | GTA-style PNG output path |
| `--include-ofm-original` | Also export an OFM Liberty image with the same center, zoom, area, and dimensions |
| `--ofm-output <path>` | Set the OFM image path and enable OFM export automatically |
| `--seed <seed>` | Change and reproduce the location layout |
| `--language <language>` | Geocoding language; defaults to `zh-CN` |
| `--force` | Replace existing output files |

## 📌 Location Icon Rules

- Every location comes from real OpenStreetMap data. The exporter does not invent locations to fill the image.
- Nightclubs and strip clubs use the high-heel `radar_strip_club.png`; bars continue to use `radar_bar.png`.
- Banks use `radar_finale_bank_heist.png` and are always rendered in pale cream yellow.
- Safehouses use `radar_safehouse.png`. Only the white body is mapped to the reference green `#28DB05`, while black windows and interior details remain intact.
- Every airport within the rendered area is displayed.
- Railway stations and other ordinary categories read up to 20 candidates and deterministically select two or three. Fewer icons are used when there are not enough real results.
- Railway stations exclude subway stations, light-rail stations, and subway entrances.
- Icons stay away from the image edges and use per-category and global spacing rules to reduce overlap.
- The same city, area, and seed reproduce the same location selection.

## 🔧 Troubleshooting

### 🔍 Codex Cannot Find the Skill

Confirm that `SKILL.md` is in one of these locations:

```text
<repository-root>/.agents/skills/gta5-map-style/SKILL.md
$HOME/.agents/skills/gta5-map-style/SKILL.md
```

In Codex CLI or the IDE extension, run `/skills` to inspect the available skills. Restart Codex if the skill still does not appear.

### 🔍 Claude Code Cannot Find the Skill

Confirm that a personal skill is located at `$HOME/.claude/skills/gta5-map-style/SKILL.md`, or that a project skill is at `<repository-root>/.claude/skills/gta5-map-style/SKILL.md`. The directory must be named `gta5-map-style`. Restart Claude Code, then try `/gta5-map-style` again.

### ⚠️ WorkBuddy Upload or Runtime Failure

Do not upload GitHub's automatically generated source-code ZIP. Download the `gta5-map-style-workbuddy.zip` asset from [GitHub Releases](https://github.com/linconz/gtamapstyle/releases/latest) and upload it directly. If the skill installs but rendering fails, confirm that the WorkBuddy execution environment provides Node.js 20+, npm, Google Chrome, and network access to the map services.

### 🧭 City or Area Cannot Be Resolved

Add a country, state, or province, such as “London, United Kingdom” or “San Jose, California, United States.” Use a recognizable administrative district, ring road, or landmark for the area.

### 📉 Too Few Icons in a Category

This usually means OpenStreetMap has too little data for that category in the selected area, or candidates were removed by the icon-spacing rules. The skill does not duplicate locations or invent missing ones.

### 📄 Output File Already Exists

Ask the Agent explicitly to replace the existing file, or add `--force` when running the exporter directly.

### 🖼️ Rendering Fails

Check the Node.js version, Google Chrome installation, and network access to OpenFreeMap, Nominatim, and Overpass. See [`references/openstreetmap-setup.md`](references/openstreetmap-setup.md) for detailed troubleshooting steps.
