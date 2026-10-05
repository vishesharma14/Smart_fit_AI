import type { FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { StepProgress } from '../components/StepProgress';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import './FlowStepLayout.css';

/** Total number of steps in the fit flow, shown in the progress indicator. */
export const FLOW_TOTAL_STEPS = 4;

interface FlowStepLayoutProps {
  /** Fit-flow step (shows the progress bar); omitted for pages after the flow, e.g. Results and Profile. */
  step?: number;
  stepLabel?: string;
  /** Extra content on the right of the top bar when there is no step progress (e.g. a Profile link). */
  topbarExtra?: ReactNode;
  /** id of the page <h1>; also used to label the step's form. */
  titleId: string;
  title: ReactNode;
  lead: ReactNode;
  /** Extra intro content under the lead, e.g. a privacy note. */
  introExtra?: ReactNode;
  /** The step's form, usually a <FlowStepForm>. */
  children: ReactNode;
}

/**
 * Shared frame for fit-flow steps: brand + progress bar, then an intro column
 * beside the step's form on desktop (stacked on smaller screens).
 */
export function FlowStepLayout({ step, stepLabel, topbarExtra, titleId, title, lead, introExtra, children }: FlowStepLayoutProps) {
  return (
    <div className="flow-step">
      <motion.div
        className="flow-step__topbar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <BrandLogo />
        {step !== undefined ? <StepProgress current={step} total={FLOW_TOTAL_STEPS} label={stepLabel ?? ''} /> : topbarExtra}
      </motion.div>

      <div className="flow-step__layout">
        <motion.section
          className="flow-step__intro"
          aria-labelledby={titleId}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.h1 id={titleId} className="flow-step__title" variants={fadeUpItem}>
            {title}
          </motion.h1>
          <motion.p className="flow-step__lead" variants={fadeUpItem}>
            {lead}
          </motion.p>
          {introExtra && <motion.div variants={fadeUpItem}>{introExtra}</motion.div>}
        </motion.section>

        {children}
      </div>
    </div>
  );
}

interface FlowStepFormProps {
  titleId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

/** Form column of a flow step. Its direct `fadeUpItem` children reveal one after another. */
export function FlowStepForm({ titleId, onSubmit, children }: FlowStepFormProps) {
  return (
    <motion.form
      className="flow-step__form"
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={titleId}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.form>
  );
}

interface FlowActionsProps {
  /** Path the Back link returns to. */
  backTo: string;
  continueLabel?: string;
}

/** Back link + Continue submit button at the end of a flow step form. */
export function FlowActions({ backTo, continueLabel = 'Continue' }: FlowActionsProps) {
  return (
    <motion.div className="flow-step__actions" variants={fadeUpItem}>
      <Button to={backTo} variant="secondary" size="lg">
        <ArrowLeft aria-hidden="true" size={20} />
        Back
      </Button>
      <Button type="submit" size="lg" className="flow-step__continue">
        {continueLabel}
        <ArrowRight aria-hidden="true" size={20} />
      </Button>
    </motion.div>
  );
}
