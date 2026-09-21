import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { DashboardFx } from '../../components/Home/DashboardFx';
import { DashboardWelcome } from '../../components/Home/DashboardWelcome';
import { DashboardSlotGamesSection } from '../../components/Home/DashboardSlotGamesSection';
import { useEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';
import { isHiddenSlotCategoryId } from '../../utils/gitslotparkLandingGames';
import '../../components/SlotGames/slot-lobby-v5.css';

function resetSlotsPageScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;
  const main = document.querySelector('.dash-main');
  if (main) {
    main.scrollTop = 0;
    main.scrollLeft = 0;
  }
}

/**
 * Dedicated Casino lobby (same casinoslots v5 design + curated 1GameHub games).
 */
export function AllSlotGames() {
  const { isAuthenticated } = useAuth();
  const { hasSlotProviders, loaded: providersLoaded } = useEnabledSlotProviders();
  const { categoryId } = useParams();

  useEffect(() => {
    resetSlotsPageScroll();
  }, [categoryId]);

  if (isHiddenSlotCategoryId(categoryId)) {
    return <Navigate to="/casino" replace />;
  }

  return (
    <div className="dashboard dash-page slot-lobby-v5">
      <DashboardFx />

      <div className="dash-layout dash-layout--sided">
        <DashboardSidebar
          activeView="casino"
          hasSlots={hasSlotProviders}
          isAuthenticated={isAuthenticated}
        />

        <div className="dash-main">
          {providersLoaded && hasSlotProviders ? (
            <DashboardWelcome isAuthenticated={isAuthenticated} placement="casino" />
          ) : null}
          <DashboardSlotGamesSection categoryId={categoryId || null} />
        </div>
      </div>
    </div>
  );
}
