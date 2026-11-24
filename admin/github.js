// Store backed by a GitHub repository, called straight from the browser.
// Every commit triggers the GitHub Action that deploys the site to Firebase Hosting.
const decodeBase64Utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function githubStore({ token, repo, branch = 'main' }) {
  const base = `https://api.github.com/repos/${repo}`;

  async function gh(path, options = {}) {
    const res = await fetch(base + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 404 && options.allow404) return null;
    if (res.status === 401) throw new Error('GitHub did not accept the access key. Check it has not expired.');
    if (res.status === 403 || res.status === 404) throw new Error(`GitHub refused access to ${repo}. Check the repository name and that the key has "Contents: Read and write" for it.`);
    if (!res.ok) throw new Error(`GitHub error ${res.status}: ${(await res.json().catch(() => ({}))).message || 'unknown'}`);
    return res.json();
  }

  return {
    // Confirms the key can see the repository (used at login).
    async check() {
      const info = await gh('');
      if (!info.permissions?.push) throw new Error(`The access key can read ${repo} but not change it. Give it "Contents: Read and write".`);
    },

    async read(path) {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const file = await gh(`/contents/${encoded}?ref=${encodeURIComponent(branch)}`, { allow404: true });
      return file ? decodeBase64Utf8(file.content) : null;
    },

    // All files go into one commit, so the site is deployed once per post.
    async commit(message, changes) {
      const ref = await gh(`/git/ref/heads/${branch}`);
      const parent = await gh(`/git/commits/${ref.object.sha}`);
      const tree = [];
      for (const c of changes) {
        if (c.delete) {
          tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
        } else {
          const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: c.content, encoding: c.encoding }) });
          tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
        }
      }
      const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
      const commit = await gh('/git/commits', {
        method: 'POST',
        body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
      });
      await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    },
  };
}
