# WorkBuddy package

This directory stores the WorkBuddy-specific metadata used by the package builder. The canonical skill instructions remain in the repository-root `SKILL.md`.

End users should download the prebuilt package from:

https://github.com/linconz/gtamapstyle/releases/latest/download/gta5-map-style-workbuddy.zip

The commands below are only for maintainers preparing a new release.

Build an upload-ready WorkBuddy package from the repository root:

```bash
npm ci
npm run package:workbuddy
```

The generated archive is `dist/workbuddy/gta5-map-style-workbuddy.zip`. Its top-level layout is:

```text
skills/
  gta5-map-style/
    SKILL.md
    package.json
    package-lock.json
    assets/
    references/
    scripts/
```

The builder combines the canonical instructions with WorkBuddy's localized display metadata, version, author, invocation flags, and `Bash` tool declaration. Do not edit a generated `dist` copy; update the root `SKILL.md` or `skill-metadata.json` and rebuild it.
