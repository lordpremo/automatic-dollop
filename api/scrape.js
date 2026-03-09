// api/scrape.js
// NEON SCRAPER API (Vercel) – returns JSON: title, og, images, videos, links

const cheerio = require("cheerio");

/**
 * Helper: make absolute URL from base + relative
 */
function makeAbsoluteUrl(base, relative) {
  if (!relative) return "";
  const rel = relative.trim();

  try {
    // If already absolute
    const u = new URL(rel);
    return u.toString();
  } catch (_) {
    // Not absolute, continue
  }

  try {
    const baseUrl = new URL(base);
    return new URL(rel, baseUrl).toString();
  } catch (_) {
    return rel;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing ?url= parameter" });
  }

  let target;
  try {
    target = new URL(url).toString();
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    // Use proxy to reduce CORS / protection issues
    const proxyUrl =
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(target);

    const response = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Failed to fetch via proxy",
        status: response.status,
        proxyUrl
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Title
    const htmlTitle = $("title").first().text().trim() || null;

    // OG tags
    const ogTitle = $('meta[property="og:title"]').attr("content") || null;
    const ogImage = $('meta[property="og:image"]').attr("content") || null;
    const ogVideo = $('meta[property="og:video"]').attr("content") || null;
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      null;

    // Images
    const images = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        images.push(makeAbsoluteUrl(target, src));
      }
    });

    // Videos (<video> + <source>)
    const videos = [];
    $("video").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        videos.push(makeAbsoluteUrl(target, src));
      }
      $(el)
        .find("source")
        .each((__, s) => {
          const ssrc = $(s).attr("src");
          if (ssrc) {
            videos.push(makeAbsoluteUrl(target, ssrc));
          }
        });
    });

    // Links
    const links = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        links.push(makeAbsoluteUrl(target, href));
      }
    });

    // Deduplicate
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];

    return res.status(200).json({
      url: target,
      proxy: proxyUrl,
      meta: {
        title: htmlTitle,
        ogTitle,
        ogImage,
        ogVideo,
        description
      },
      counts: {
        images: uniq(images).length,
        videos: uniq(videos).length,
        links: uniq(links).length
      },
      images: uniq(images),
      videos: uniq(videos),
      links: uniq(links)
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal error",
      message: err.message
    });
  }
};
