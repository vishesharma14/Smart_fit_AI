import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CameraOff, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { DemoBadge } from '../components/demo/DemoModeBanner';
import '../components/demo/demo.css';
import '../components/results/results.css';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowActions, FlowStepForm, FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { FIT_DEFINITIONS, getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { buildDemoScanResult, DEMO_MEASUREMENTS_CM, DEMO_NOTICE, DEMO_SCAN_QUALITY } from '../utils/demo/demoData';
import { definitionsForRegion } from '../utils/measurement/definitions';
import { fadeUpItem } from '../utils/motion';
import { scanRegionFor } from '../utils/pose/scanRegions';
import { LEVEL_LABELS } from '../utils/scanQuality/scanQuality';
import './DemoScanPage.css';

const TITLE_ID = 'demo-scan-title';

/**
 * Demo Scan (Step 18): replaces the camera step while Demo Mode is on. It never requests the camera; "Use Sample Scan"
 * hands the fixed sample data to the existing measurement review as an ordinary scan result marked as demo.
 */
export function DemoScanPage() {
  useDocumentTitle(pageTitle('Demo scan'));
  const navigate = useNavigate();
  const demoMode = useAppStore((s) => s.demoMode);
  const clothing = useAppStore((s) => s.clothingSelection);
  const setScanMeasurements = useAppStore((s) => s.setScanMeasurements);
  const garment = clothing?.type ?? null;
  const region = scanRegionFor(garment);
  const sample = definitionsForRegion(region.id).filter((d) => d.kind !== 'unsupported');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScanMeasurements(buildDemoScanResult(garment));
    navigate(PATHS.measurements);
  };

  return (
    <FlowStepLayout
      step={3}
      stepLabel="Demo scan"
      titleId={TITLE_ID}
      title={
        <>
          Demo <span className="flow-step__title-accent">scan</span>
        </>
      }
      lead="See how SizerAI turns a body scan into measurements and a size, using a fixed set of sample data."
      introExtra={
        <div className="demo-notice">
          <DemoBadge />
          <p>
            <strong>{DEMO_NOTICE}</strong>
          </p>
          <p>
            The values below are fictional sample measurements, the same every time. They go through the real measurement
            review and sizing steps, but they are not anyone’s body measurements.
          </p>
        </div>
      }
    >
      {demoMode ? (
        <FlowStepForm titleId={TITLE_ID} onSubmit={handleSubmit}>
          <motion.section className="result-card demo-scan" aria-labelledby="demo-scan-sample-title" variants={fadeUpItem}>
            <div className="demo-scan__head">
              <span className="demo-scan__icon" aria-hidden="true">
                <CameraOff size={22} />
              </span>
              <div>
                <h2 id="demo-scan-sample-title" className="result-card__title">
                  Sample scan
                </h2>
                <p className="result-card__text">
                  {garment
                    ? `${getClothingItem(garment).label}${clothing?.fit ? ` · ${FIT_DEFINITIONS[clothing.fit].label}` : ''} · ${region.label}`
                    : region.label}
                </p>
              </div>
              <DemoBadge label="Sample data" />
            </div>
            <dl className="demo-scan__values" aria-label="Sample measurements">
              {sample.map((d) => (
                <div key={d.id}>
                  <dt>{d.name}</dt>
                  <dd>{DEMO_MEASUREMENTS_CM[d.id]} cm</dd>
                </div>
              ))}
            </dl>
            <p className="demo-scan__quality">
              Sample scan quality: <strong>{DEMO_SCAN_QUALITY.score}/100 {LEVEL_LABELS[DEMO_SCAN_QUALITY.level]}</strong>{' '}
              (demo value, not calculated from a scan)
            </p>
          </motion.section>
          <FlowActions backTo={PATHS.clothing} continueLabel="Use Sample Scan" />
        </FlowStepForm>
      ) : (
        <motion.div className="flow-step__form" initial="hidden" animate="visible">
          <motion.section className="result-card" aria-labelledby="demo-off-title" variants={fadeUpItem}>
            <h2 id="demo-off-title" className="result-card__title">
              <FlaskConical aria-hidden="true" size={18} /> Demo Mode is off
            </h2>
            <p className="result-card__text">Start Demo Mode from the welcome page, or scan with your camera.</p>
            <div className="result-actions">
              <Button to={PATHS.home} size="lg">
                Go to the start
              </Button>
              <Button to={PATHS.scan} variant="secondary" size="lg">
                Body scan
              </Button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </FlowStepLayout>
  );
}
