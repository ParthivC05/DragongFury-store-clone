import './HelpContent.css';

/**
 * Renders one help topic from API: rich text HTML + optional single video link.
 */
export function HelpContentFromApi({ topic, pageTitle }) {
  const { content, video_url } = topic || {};
  const hasContent = content != null && String(content).trim() !== '';
  const hasVideo = video_url != null && String(video_url).trim() !== '';

  return (
    <div className="rounded-2xl bg-card border border-gray-700 p-4 sm:p-6">
      {(pageTitle && (hasContent || hasVideo)) && (
        <h3 className="text-base sm:text-lg font-semibold text-gray-100 m-0 mb-3">{pageTitle}</h3>
      )}
      {hasContent && (
        <div
          className="help-api-content"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
      {hasVideo && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Video guide</p>
          <div className="rounded-xl overflow-hidden border border-gray-600 bg-black/40 aspect-video max-w-2xl">
            <iframe
              title="Help video"
              src={embedVideoUrl(video_url)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      {!hasContent && !hasVideo && (
        <p className="text-gray-400 text-sm m-0">No content for this topic yet.</p>
      )}
    </div>
  );
}

function embedVideoUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (u.includes('youtube.com/watch?v=')) {
    const m = u.match(/[?&]v=([^&]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : u;
  }
  if (u.includes('youtu.be/')) {
    const m = u.match(/youtu\.be\/([^?&]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : u;
  }
  if (u.includes('vimeo.com/')) {
    const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : u;
  }
  return u;
}
