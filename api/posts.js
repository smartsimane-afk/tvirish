// Vercel serverless function behind the blog dashboard (/admin).
//   GET    /api/posts            list posts
//   POST   /api/posts            publish a post
//   DELETE /api/posts?slug=...   delete a post
// Required environment variables: ADMIN_PASSWORD, GITLAB_TOKEN, GITLAB_PROJECT (e.g. username/tvirish).
// Optional: GITLAB_BRANCH (default main), GITLAB_URL (default https://gitlab.com).
import { createHash, timingSafeEqual } from 'node:crypto';
import { BlogError, createPost, deletePost, listPosts } from '../lib/blog.js';
import { gitlabStore } from '../lib/gitlab.js';

const hash = (s) => createHash('sha256').update(String(s)).digest();

function authorized(req) {
  const given = req.headers['x-admin-password'] || '';
  return timingSafeEqual(hash(given), hash(process.env.ADMIN_PASSWORD));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { ADMIN_PASSWORD, GITLAB_TOKEN, GITLAB_PROJECT, GITLAB_BRANCH, GITLAB_URL } = process.env;
  if (!ADMIN_PASSWORD || !GITLAB_TOKEN || !GITLAB_PROJECT) {
    return res.status(500).json({ error: 'The dashboard is not set up yet: add ADMIN_PASSWORD, GITLAB_TOKEN and GITLAB_PROJECT in Vercel.' });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Wrong password.' });

  const store = gitlabStore({ token: GITLAB_TOKEN, project: GITLAB_PROJECT, branch: GITLAB_BRANCH || 'main', baseUrl: GITLAB_URL });
  try {
    if (req.method === 'GET') return res.json({ posts: listPosts((await store.read('blog.html')) || '') });
    if (req.method === 'POST') return res.json(await createPost(store, req.body || {}));
    if (req.method === 'DELETE') return res.json(await deletePost(store, req.query.slug));
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof BlogError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Saving to GitLab failed. Check the GITLAB_TOKEN and GITLAB_PROJECT settings in Vercel.' });
  }
}
