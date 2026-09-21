/**
 * Shared SEO fields for blog posts and footer content pages.
 * Optional — if left blank, the live site falls back to the page title / site defaults.
 */
export function SeoMetaFields({
  form,
  setField,
  titleHint,
  hideHeading = false,
  showIndexControl = false,
  indexNoun = 'post',
  indexControlName = 'blog-google-index'
}) {
  return (
    <div className="blog-admin-seo">
      {!hideHeading && (
        <p className="blog-admin-seo-title">Search engines (SEO)</p>
      )}
      <p className="blog-admin-seo-desc">
        {titleHint
          || 'Controls the browser tab title and what Google / social previews show. Leave blank to use the page title.'}
      </p>
      <label className="blog-admin-field">
        <span>Meta title</span>
        <input
          type="text"
          value={form.metaTitle || ''}
          onChange={(e) => setField('metaTitle', e.target.value)}
          placeholder="e.g. Responsible Gaming | Store Name"
          maxLength={512}
        />
        <span className="blog-admin-hint">Browser tab title. Aim for under 60 characters.</span>
      </label>
      <label className="blog-admin-field">
        <span>Meta description</span>
        <textarea
          value={form.metaDescription || ''}
          onChange={(e) => setField('metaDescription', e.target.value)}
          placeholder="Short summary shown under the title in Google results."
          maxLength={2000}
          rows={3}
        />
        <span className="blog-admin-hint">Aim for about 150–160 characters.</span>
      </label>
      <label className="blog-admin-field">
        <span>Meta tags</span>
        <input
          type="text"
          value={form.metaTags || ''}
          onChange={(e) => setField('metaTags', e.target.value)}
          placeholder="sweepstakes, bonuses, responsible gaming"
          maxLength={1024}
        />
        <span className="blog-admin-hint">Comma-separated keywords.</span>
      </label>
      {showIndexControl && (
        <div className="blog-admin-field">
          <span>Google indexing</span>
          <div className="blog-admin-index-options">
            <label className="blog-admin-field-toggle">
              <input
                type="radio"
                name={indexControlName}
                checked={form.allowIndex !== false}
                onChange={() => setField('allowIndex', true)}
              />
              <span>Allow Google to list this {indexNoun}</span>
            </label>
            <label className="blog-admin-field-toggle">
              <input
                type="radio"
                name={indexControlName}
                checked={form.allowIndex === false}
                onChange={() => setField('allowIndex', false)}
              />
              <span>Keep this {indexNoun} out of Google</span>
            </label>
          </div>
          <span className="blog-admin-hint">
            “Keep out of Google” adds a noindex robots tag so Google Search Console will not index this URL.
            Existing listings stay until you switch this.
          </span>
        </div>
      )}
    </div>
  )
}
