import fs from 'node:fs'
import path from 'node:path'

const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim()
if (!token) {
  console.error('GH_TOKEN or GITHUB_TOKEN is required.')
  process.exit(1)
}

const packageJsonPath = path.resolve(process.cwd(), 'package.json')
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = String(process.env.BOOKSPACE_RELEASE_VERSION || pkg.version || '').trim()
if (!version) {
  console.error('Unable to resolve release version.')
  process.exit(1)
}

const publishEntry = Array.isArray(pkg.build?.publish) ? pkg.build.publish[0] : null
const owner = String(publishEntry?.owner || '').trim()
const repo = String(publishEntry?.repo || '').trim()
if (!owner || !repo) {
  console.error('package.json build.publish[0] owner/repo is required.')
  process.exit(1)
}

const tag = `v${version}`
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'bookspace-release-finalizer',
}

async function githubJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 500)}`)
  }

  return response.json()
}

const releases = await githubJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`)
const release = releases.find((entry) => entry?.tag_name === tag)

if (!release) {
  console.error(`Release not found for tag ${tag}.`)
  process.exit(1)
}

if (release.draft) {
  const published = await githubJson(`https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })

  console.log(`Published release ${published.tag_name}: ${published.html_url}`)
} else {
  console.log(`Release already published: ${release.tag_name}: ${release.html_url}`)
}
