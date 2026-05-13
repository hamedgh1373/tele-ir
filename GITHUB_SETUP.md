# GitHub Publish Checklist

To publish this project directly to GitHub, prepare one of these:

1. Personal Access Token (recommended)
- Required scope: `repo`
- Optional: `workflow`

2. SSH key
- Add the server public key to your GitHub account

3. GitHub CLI login
- `gh auth login`

Recommended repository name:
- `tele-ir`

Recommended visibility:
- `public`

After authentication is available, create the repository and push:

```bash
GITHUB_TOKEN=YOUR_TOKEN bash publish-github.sh hamedgh1373 tele-ir public
```
