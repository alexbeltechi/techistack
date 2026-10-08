# techistack

Agent skills for curating creative work: `skills/contactsheet` and
`skills/curate`. This repo is where they're developed; the published plugin
is what other people install.

## Working on the skills

- Edit the skills here. On the maintainer's machine they're linked into
  `~/.claude/skills/`, so every project uses this working copy live.
- Each skill carries its own `package.json`; run `npm install` in its folder
  after changing dependencies. `node_modules` is ignored.
- `skills/curate/lessons.md` is the maintainer's own taste. It's git-ignored
  and must never be committed or published; `lessons.example.md` is the
  public starting point.
- Keep the skills free of anyone's personal paths, names or projects. Docs
  and examples use mock data (`~/Pictures/2024/studio-visit`).

## Rules the skills must keep

- Never delete anything in a source folder. Originals are read-only; the
  skills only add new, dated `contactsheet_…`, `_curate_…` and `selection_…`
  folders, and never overwrite.
- What's fine to show is the user's call: no content flagging.
- Test on copies in a scratch folder, never on real archives.

## Testing a change

```bash
mkdir -p /tmp/ts-test/shoot && cp <a few images> /tmp/ts-test/shoot/
node skills/contactsheet/scripts/contactsheet.mjs sheet /tmp/ts-test/shoot --max all
node skills/curate/scripts/curate.mjs open /tmp/ts-test/shoot
```

Then `write` a small plan, `pdf`, and `select`, and look at the output.

## Releasing

1. Add a `CHANGELOG.md` entry at the top.
2. Bump `version` in `.claude-plugin/plugin.json` and
   `.claude-plugin/marketplace.json` (patch for fixes, minor for new
   behaviour; it's beta until 1.0).
3. Commit, tag `vX.Y.Z`, push `main` and the tag.
4. `gh release create vX.Y.Z --prerelease` with the changelog entry as notes.
