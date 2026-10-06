import { createBrowserRouter } from 'react-router';
import { RootLayout } from '../layouts/RootLayout';
import { BodyScanPage } from '../pages/BodyScanPage';
import { ClothingSelectionPage } from '../pages/ClothingSelectionPage';
import { DemoScanPage } from '../pages/DemoScanPage';
import { HomePage } from '../pages/HomePage';
import { MeasurementReviewPage } from '../pages/MeasurementReviewPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PrivacyCenterPage } from '../pages/PrivacyCenterPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ResultsPage } from '../pages/ResultsPage';
import { UserInfoPage } from '../pages/UserInfoPage';
import { PATHS } from './paths';

export const router = createBrowserRouter([
  {
    path: PATHS.home,
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: PATHS.userInfo, element: <UserInfoPage /> },
      { path: PATHS.clothing, element: <ClothingSelectionPage /> },
      { path: PATHS.scan, element: <BodyScanPage /> },
      { path: PATHS.demoScan, element: <DemoScanPage /> },
      { path: PATHS.measurements, element: <MeasurementReviewPage /> },
      { path: PATHS.results, element: <ResultsPage /> },
      { path: PATHS.profile, element: <ProfilePage /> },
      { path: PATHS.privacy, element: <PrivacyCenterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
