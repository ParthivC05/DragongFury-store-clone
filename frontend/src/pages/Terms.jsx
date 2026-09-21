import { Link } from 'react-router-dom';
import { site } from '../config/site';
import { usePageContentReady } from '../context/PageReadyContext';

export function Terms() {
  usePageContentReady(true);

  return (
    <div className="w-full max-w-6xl">
      <h1 className="mb-4 text-2xl font-bold text-gray-100">Terms and Conditions</h1>
      <p className="text-gray-400">
        Terms and conditions content will be added here. For support, contact{' '}
        <a href={`mailto:${site.supportEmail}`} className="text-primary">{site.supportEmail}</a>
        {' '}or {site.supportPhone}.
      </p>
      <p className="mt-6 text-gray-400 text-sm">{site.copyright}</p>
      <p className="mt-4">
        <Link to="/register">Back to Sign Up</Link>
      </p>
    </div>
  );
}
