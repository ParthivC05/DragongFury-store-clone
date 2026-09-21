import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useToast } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { PublicRouteGuard } from './components/PublicRouteGuard'
import { canAccessAdminPanel, isTechnicalStaff } from './constants/roles'
import { canAccessPath, getFirstAllowedPathForUser } from './constants/routeConfig'
import Layout from './components/Layout'
import { StaffAttendanceProvider } from './context/StaffAttendanceContext'
import { Toaster } from './components/Toaster'
import { MaintenanceScreen } from './components/MaintenanceScreen'
import {
  startBackendHealthMonitor,
  stopBackendHealthMonitor,
  subscribeBackendMaintenance
} from './utils/backendHealth'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Distributors from './pages/Distributors'
import DistributorForm from './pages/DistributorForm'
import Stores from './pages/Stores'
import StoreForm from './pages/StoreForm'
import StoreDetail from './pages/StoreDetail'
import Users from './pages/Users'
import UserDirectory from './pages/UserDirectory'
import ContactLists from './pages/ContactLists'
import UserDetail from './pages/UserDetail'
import Profile from './pages/Profile'
import Reports from './pages/Reports'
import BonusReport from './pages/BonusReport'
import BonusScUsageReport from './pages/BonusScUsageReport'
import PaymentReport from './pages/PaymentReport'
import WalletAdjustReport from './pages/WalletAdjustReport'
import WalletScReconciliation from './pages/WalletScReconciliation'
import DailyScReport from './pages/DailyScReport'
import KycReport from './pages/KycReport'
import SpinWheel from './pages/SpinWheel'
import Vip from './pages/Vip'
import Affiliate from './pages/Affiliate'
import ReferralTransactions from './pages/ReferralTransactions'
import DepositBonuses from './pages/DepositBonuses'
import WelcomeSignupBonus from './pages/WelcomeSignupBonus'
import ActivateBonusModal from './pages/ActivateBonusModal'
import DashboardSlideshow from './pages/DashboardSlideshow'
import DashboardPromoModals from './pages/DashboardPromoModals'
import DailyBonus from './pages/DailyBonus'
import EmailCampaigns from './pages/EmailCampaigns'
import PushCampaigns from './pages/PushCampaigns'
import DepositPackages from './pages/DepositPackages'
import StoreRoleForm from './pages/StoreRoleForm'
import StoreStaffForm from './pages/StoreStaffForm'
import AdminRoleForm from './pages/AdminRoleForm'
import AdminStaffForm from './pages/AdminStaffForm'
import TeamAccess, { RedirectToTeam } from './pages/TeamAccess'
import StaffAttendance from './pages/StaffAttendance'
import Games from './pages/Games'
import SlotProviders from './pages/SlotProviders'
import GameLogs from './pages/GameLogs'
import SlotsTransactions from './pages/SlotsTransactions'
import GameReport from './pages/GameReport'
import GameManualRequests from './pages/GameManualRequests'
import Subscriptions from './pages/Subscriptions'
import SubscriptionForm from './pages/SubscriptionForm'
import SubscriptionRequests from './pages/SubscriptionRequests'
import MySubscription from './pages/MySubscription'
import PaymentProviders from './pages/PaymentProviders'
import LightningWallet from './pages/LightningWallet'
import DirectCryptoTreasury from './pages/DirectCryptoTreasury'
import ChimeCashappWithdrawals from './pages/ChimeCashappWithdrawals'
import ChimeDeposits from './pages/ChimeDeposits'
import ChimeAccounts from './pages/ChimeAccounts'
import Deposits from './pages/Deposits'
import Help from './pages/Help'
import SupportTickets from './pages/SupportTickets'
import SocialLinks from './pages/SocialLinks'
import LandingPaymentLinks from './pages/LandingPaymentLinks'
import BlogPosts from './pages/BlogPosts'
import BlogPostForm from './pages/BlogPostForm'
import Link2PlayGames from './pages/Link2PlayGames'
import Link2PlayGameForm from './pages/Link2PlayGameForm'
import FooterPages from './pages/FooterPages'
import FooterPageForm from './pages/FooterPageForm'
import LegalPageForm from './pages/LegalPageForm'
import Bonus from './pages/Bonus'
import WalletLimits from './pages/WalletLimits'
import TransactionFees from './pages/TransactionFees'
import StoreWalletSummary from './pages/StoreWalletSummary'
import AutomationUsage from './pages/AutomationUsage'
import GeoIpAllowlist from './pages/GeoIpAllowlist'
import FingerprintSignupIpAllowlist from './pages/FingerprintSignupIpAllowlist'
import DiditKyc from './pages/DiditKyc'
import PhoneVerification from './pages/PhoneVerification'
import OpsPulse from './pages/OpsPulse'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const toast = useToast()
  useEffect(() => {
    if (!loading && user && !canAccessAdminPanel(user.role) && !user.isAdmin) {
      toast.error('Access denied. Admin only.')
    }
  }, [loading, user, toast])
  if (loading) return <div className="app-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  const redirectRoute = getFirstAllowedPathForUser(user);
  if (!canAccessAdminPanel(user.role) && !user.isAdmin) return <Navigate to={redirectRoute} replace />
  return children
}

function RoleRoute({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const allowed = canAccessPath(pathname, user?.role, user)
  if (!allowed && user) {
    return <Navigate to={getFirstAllowedPathForUser(user)} replace state={{ from: pathname }} />
  }
  return children
}

function TechnicalStaffRoute({ children }) {
  const { user } = useAuth()
  if (!isTechnicalStaff(user)) {
    return <Navigate to={getFirstAllowedPathForUser(user)} replace />
  }
  return children
}

export default function App() {
  const [maintenance, setMaintenance] = useState(false)

  useEffect(() => {
    startBackendHealthMonitor()
    const unsub = subscribeBackendMaintenance(setMaintenance)
    return () => {
      unsub()
      stopBackendHealthMonitor()
    }
  }, [])

  if (maintenance) return <MaintenanceScreen />

  return (
    <ConfirmProvider>
      <Toaster />
      <PublicRouteGuard>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <StaffAttendanceProvider>
              <Layout />
            </StaffAttendanceProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRoute><Dashboard /></RoleRoute>} />
        <Route path="distributors" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<Distributors />} />
          <Route path="new" element={<DistributorForm />} />
          <Route path=":id/edit" element={<DistributorForm />} />
        </Route>
        <Route path="stores" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<Stores />} />
          <Route path="new" element={<StoreForm />} />
          <Route path=":id" element={<StoreDetail />} />
          <Route path=":id/edit" element={<StoreForm />} />
        </Route>
        <Route path="team" element={<RoleRoute><TeamAccess /></RoleRoute>} />
        <Route path="admin-roles" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<RedirectToTeam scope="platform" tab="roles" />} />
          <Route path="new" element={<AdminRoleForm />} />
          <Route path=":id/edit" element={<AdminRoleForm />} />
        </Route>
        <Route path="admin-staff" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<RedirectToTeam scope="platform" tab="staff" />} />
          <Route path="new" element={<AdminStaffForm />} />
          <Route path=":id/edit" element={<AdminStaffForm />} />
        </Route>
        <Route path="store-roles" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<RedirectToTeam scope="store" tab="roles" />} />
          <Route path="new" element={<StoreRoleForm />} />
          <Route path=":id/edit" element={<StoreRoleForm />} />
        </Route>
        <Route path="store-staff" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<RedirectToTeam scope="store" tab="staff" />} />
          <Route path="new" element={<StoreStaffForm />} />
          <Route path=":id/edit" element={<StoreStaffForm />} />
        </Route>
        <Route path="users" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<Users />} />
          <Route path=":userId" element={<UserDetail />} />
        </Route>
        <Route path="user-list" element={<RoleRoute><UserDirectory /></RoleRoute>} />
        <Route path="contact-lists" element={<RoleRoute><ContactLists /></RoleRoute>} />
        <Route path="profile" element={<Profile />} />
        <Route path="s7k9n2" element={<RoleRoute><TechnicalStaffRoute><OpsPulse /></TechnicalStaffRoute></RoleRoute>} />
        <Route path="reports" element={<RoleRoute><Reports /></RoleRoute>} />
        <Route path="bonus-report" element={<RoleRoute><BonusReport /></RoleRoute>} />
        <Route path="bonus-sc-usage" element={<RoleRoute><BonusScUsageReport /></RoleRoute>} />
        <Route path="payment-report" element={<RoleRoute><PaymentReport /></RoleRoute>} />
        <Route path="wallet-adjust-report" element={<RoleRoute><WalletAdjustReport /></RoleRoute>} />
        <Route path="wallet-sc-reconciliation" element={<RoleRoute><WalletScReconciliation /></RoleRoute>} />
        <Route path="daily-sc-report" element={<RoleRoute><DailyScReport /></RoleRoute>} />
        <Route path="staff-attendance" element={<RoleRoute><StaffAttendance /></RoleRoute>} />
        <Route path="kyc-report" element={<RoleRoute><KycReport /></RoleRoute>} />
        <Route path="spin-wheel" element={<RoleRoute><SpinWheel /></RoleRoute>} />
        <Route path="vip" element={<RoleRoute><Vip /></RoleRoute>} />
        <Route path="affiliate" element={<RoleRoute><Affiliate /></RoleRoute>} />
        <Route path="referral-transactions" element={<RoleRoute><ReferralTransactions /></RoleRoute>} />
        <Route path="deposit-bonuses" element={<RoleRoute><DepositBonuses /></RoleRoute>} />
        <Route path="welcome-signup-bonus" element={<RoleRoute><WelcomeSignupBonus /></RoleRoute>} />
        <Route path="activate-bonus-modal" element={<RoleRoute><ActivateBonusModal /></RoleRoute>} />
        <Route path="dashboard-slideshow" element={<RoleRoute><DashboardSlideshow /></RoleRoute>} />
        <Route path="dashboard-promo-modals" element={<RoleRoute><DashboardPromoModals /></RoleRoute>} />
        <Route path="daily-bonus" element={<RoleRoute><DailyBonus /></RoleRoute>} />
        <Route path="email-campaigns" element={<RoleRoute><EmailCampaigns /></RoleRoute>} />
        <Route path="push-campaigns" element={<RoleRoute><PushCampaigns /></RoleRoute>} />
        <Route path="deposit-packages" element={<RoleRoute><DepositPackages /></RoleRoute>} />
        <Route path="games" element={<RoleRoute><Games /></RoleRoute>} />
        <Route path="slot-providers" element={<RoleRoute><SlotProviders /></RoleRoute>} />
        <Route path="automation-usage" element={<RoleRoute><AutomationUsage /></RoleRoute>} />
        <Route path="geo-ip-allowlist" element={<RoleRoute><GeoIpAllowlist /></RoleRoute>} />
        <Route path="fingerprint-signup-ip-allowlist" element={<RoleRoute><FingerprintSignupIpAllowlist /></RoleRoute>} />
        <Route path="didit-kyc" element={<RoleRoute><DiditKyc /></RoleRoute>} />
        <Route path="phone-verification" element={<RoleRoute><PhoneVerification /></RoleRoute>} />
        <Route path="game-logs" element={<RoleRoute><GameLogs /></RoleRoute>} />
        <Route path="slots-transactions" element={<RoleRoute><SlotsTransactions /></RoleRoute>} />
        <Route path="casino-games-report" element={<RoleRoute><GameReport /></RoleRoute>} />
        <Route path="game-report" element={<Navigate to="/casino-games-report" replace />} />
        <Route path="game-manual-requests" element={<RoleRoute><GameManualRequests /></RoleRoute>} />
        <Route path="subscriptions" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<Subscriptions />} />
          <Route path="new" element={<SubscriptionForm />} />
          <Route path=":id/edit" element={<SubscriptionForm />} />
        </Route>
        <Route path="subscription-requests" element={<RoleRoute><SubscriptionRequests /></RoleRoute>} />
        <Route path="subscription" element={<RoleRoute><MySubscription /></RoleRoute>} />
        <Route path="payment-providers" element={<RoleRoute><PaymentProviders /></RoleRoute>} />
        <Route path="lightning-wallet" element={<RoleRoute><LightningWallet /></RoleRoute>} />
        <Route path="wallet-limits" element={<RoleRoute><WalletLimits /></RoleRoute>} />
        <Route path="transaction-fees" element={<RoleRoute><TransactionFees /></RoleRoute>} />
        <Route path="store-wallet-summary" element={<RoleRoute><StoreWalletSummary /></RoleRoute>} />
        <Route path="deposits" element={<RoleRoute><Deposits /></RoleRoute>} />
        <Route path="direct-crypto-treasury" element={<RoleRoute><DirectCryptoTreasury /></RoleRoute>} />
        <Route path="chime-cashapp-withdrawals" element={<RoleRoute><ChimeCashappWithdrawals /></RoleRoute>} />
        <Route path="chime-deposits" element={<RoleRoute><ChimeDeposits /></RoleRoute>} />
        <Route path="chime-accounts" element={<RoleRoute><ChimeAccounts /></RoleRoute>} />
        <Route path="help" element={<RoleRoute><Help /></RoleRoute>} />
        <Route path="support-tickets" element={<RoleRoute><SupportTickets /></RoleRoute>} />
        <Route path="social-links" element={<RoleRoute><SocialLinks /></RoleRoute>} />
        <Route path="landing-payment-links" element={<RoleRoute><LandingPaymentLinks /></RoleRoute>} />
        <Route path="blog" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<BlogPosts />} />
          <Route path="new" element={<BlogPostForm />} />
          <Route path=":id/edit" element={<BlogPostForm />} />
        </Route>
        <Route path="link2play" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<Link2PlayGames />} />
          <Route path="new" element={<Link2PlayGameForm />} />
          <Route path=":id/edit" element={<Link2PlayGameForm />} />
        </Route>
        <Route path="footer" element={<RoleRoute><Outlet /></RoleRoute>}>
          <Route index element={<FooterPages />} />
          <Route path="pages/new" element={<FooterPageForm />} />
          <Route path="pages/:id/edit" element={<FooterPageForm />} />
          <Route path="legal/:pageKey" element={<LegalPageForm />} />
        </Route>
        <Route path="bonus" element={<RoleRoute><Bonus /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </PublicRouteGuard>
    </ConfirmProvider>
  )
}
