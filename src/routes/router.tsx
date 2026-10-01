import { createBrowserRouter } from 'react-router';
import { RootLayout } from '../layouts/RootLayout';
import { BodyScanPage } from '../pages/BodyScanPage';
import { ClothingSelectionPage } from '../pages/ClothingSelectionPage';
import { HomePage } from '../pages/HomePage';
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
    ],
  },
]);
