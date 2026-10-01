import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Mars, ShieldCheck, Smile, Venus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { StepProgress } from '../components/StepProgress';
import { ChoiceCards, type ChoiceOption } from '../components/form/ChoiceCards';
import { FormField } from '../components/form/FormField';
import { SegmentedControl, type SegmentOption } from '../components/form/SegmentedControl';
import { TextInput } from '../components/form/TextInput';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useUserInfoForm } from '../hooks/useUserInfoForm';
import { PATHS } from '../routes/paths';
import type { Gender, HeightUnit, WeightUnit } from '../types/domain';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import type { UserInfoField } from '../utils/userInfoValidation';
import './UserInfoPage.css';

const FIELD_IDS: Record<UserInfoField, string> = {
  name: 'user-name',
  gender: 'user-gender',
  age: 'user-age',
  height: 'user-height',
  weight: 'user-weight',
};

const GENDER_OPTIONS: ChoiceOption<Gender>[] = [
  { value: 'men', label: 'Men', description: "Men's sizing", icon: Mars },
  { value: 'women', label: 'Women', description: "Women's sizing", icon: Venus },
  { value: 'children', label: 'Children 10+', description: 'Ages 10–17', icon: Smile },
];

const HEIGHT_UNITS: SegmentOption<HeightUnit>[] = [
  { value: 'cm', label: 'cm', ariaLabel: 'Centimetres' },
  { value: 'ft-in', label: 'ft / in', ariaLabel: 'Feet and inches' },
];

const WEIGHT_UNITS: SegmentOption<WeightUnit>[] = [
  { value: 'kg', label: 'kg', ariaLabel: 'Kilograms' },
  { value: 'lb', label: 'lb', ariaLabel: 'Pounds' },
];

/** Step 1 of the fit flow: basic, self-reported information about the user. */
export function UserInfoPage() {
  useDocumentTitle(pageTitle('Your details'));
  const navigate = useNavigate();
  const { draft, heightUnit, weightUnit, visibleErrors: errors, setValue, markTouched, changeHeightUnit, changeWeightUnit, submit } =
    useUserInfoForm();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstInvalid = submit();
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    navigate(PATHS.clothing);
  };

  return (
    <div className="user-info">
      <motion.div
        className="user-info__topbar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <BrandLogo />
        <StepProgress current={1} total={4} label="Your details" />
      </motion.div>

      <div className="user-info__layout">
        <motion.section
          className="user-info__intro"
          aria-labelledby="user-info-title"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.h1 id="user-info-title" className="user-info__title" variants={fadeUpItem}>
            Let's build your <span className="user-info__title-accent">fit profile.</span>
          </motion.h1>
          <motion.p className="user-info__lead" variants={fadeUpItem}>
            Tell us a little about yourself so SizerAI can personalize your fit recommendations.
          </motion.p>
          <motion.div className="user-info__privacy" variants={fadeUpItem}>
            <ShieldCheck className="user-info__privacy-icon" aria-hidden="true" size={20} strokeWidth={1.75} />
            <p>
              <strong>Private by design.</strong> Your details stay in this browser tab for this session. Nothing
              you enter here is uploaded.
            </p>
          </motion.div>
        </motion.section>

        <motion.form
          className="user-info__form"
          noValidate
          onSubmit={handleSubmit}
          aria-labelledby="user-info-title"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.section className="form-card" aria-labelledby="about-you-title" variants={fadeUpItem}>
            <header className="form-card__header">
              <h2 id="about-you-title" className="form-card__title">
                About you
              </h2>
              <p className="form-card__subtitle">Who this fit profile is for.</p>
            </header>

            <FormField label="Name" optional error={errors.name} controlId={FIELD_IDS.name}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="name"
                  autoComplete="given-name"
                  placeholder="e.g. Alex"
                  value={draft.name}
                  onChange={(e) => setValue('name', e.target.value)}
                  onBlur={() => markTouched('name')}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </FormField>

            <FormField
              label="Gender"
              hint="Choose the size range you usually shop in."
              group
              error={errors.gender}
              controlId={FIELD_IDS.gender}
            >
              {({ id, describedBy, invalid }) => (
                <ChoiceCards
                  options={GENDER_OPTIONS}
                  value={draft.gender}
                  onChange={(gender) => setValue('gender', gender)}
                  onBlur={() => markTouched('gender')}
                  firstId={id}
                  describedBy={describedBy}
                  invalid={invalid}
                />
              )}
            </FormField>
          </motion.section>

          <motion.section className="form-card" aria-labelledby="basics-title" variants={fadeUpItem}>
            <header className="form-card__header">
              <h2 id="basics-title" className="form-card__title">
                Your basics
              </h2>
              <p className="form-card__subtitle">
                Self-reported values. We use them as a starting point, not as body measurements.
              </p>
            </header>

            <FormField label="Age" error={errors.age} controlId={FIELD_IDS.age}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="age"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 28"
                  suffix="years"
                  value={draft.age}
                  onChange={(e) => setValue('age', e.target.value)}
                  onBlur={() => markTouched('age')}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </FormField>

            <FormField
              label="Height"
              group
              error={errors.height}
              controlId={FIELD_IDS.height}
              labelAction={
                <SegmentedControl legend="Height unit" options={HEIGHT_UNITS} value={heightUnit} onChange={changeHeightUnit} />
              }
            >
              {({ id, describedBy, invalid }) =>
                heightUnit === 'cm' ? (
                  <TextInput
                    id={id}
                    name="height-cm"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="e.g. 175"
                    suffix="cm"
                    aria-label="Height in centimetres"
                    value={draft.heightCm}
                    onChange={(e) => setValue('heightCm', e.target.value)}
                    onBlur={() => markTouched('height')}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                ) : (
                  <div className="user-info__split">
                    <TextInput
                      id={id}
                      name="height-ft"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="5"
                      suffix="ft"
                      aria-label="Height, feet"
                      value={draft.heightFeet}
                      onChange={(e) => setValue('heightFeet', e.target.value)}
                      onBlur={() => markTouched('height')}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                    <TextInput
                      id={`${id}-inches`}
                      name="height-in"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="9"
                      suffix="in"
                      aria-label="Height, inches"
                      value={draft.heightInches}
                      onChange={(e) => setValue('heightInches', e.target.value)}
                      onBlur={() => markTouched('height')}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  </div>
                )
              }
            </FormField>

            <FormField
              label="Weight"
              group
              error={errors.weight}
              controlId={FIELD_IDS.weight}
              labelAction={
                <SegmentedControl legend="Weight unit" options={WEIGHT_UNITS} value={weightUnit} onChange={changeWeightUnit} />
              }
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="weight"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={weightUnit === 'kg' ? 'e.g. 70' : 'e.g. 155'}
                  suffix={weightUnit}
                  aria-label={weightUnit === 'kg' ? 'Weight in kilograms' : 'Weight in pounds'}
                  value={draft.weight}
                  onChange={(e) => setValue('weight', e.target.value)}
                  onBlur={() => markTouched('weight')}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </FormField>
          </motion.section>

          <motion.div className="user-info__actions" variants={fadeUpItem}>
            <Button to={PATHS.home} variant="secondary" size="lg">
              <ArrowLeft aria-hidden="true" size={20} />
              Back
            </Button>
            <Button type="submit" size="lg" className="user-info__continue">
              Continue
              <ArrowRight aria-hidden="true" size={20} />
            </Button>
          </motion.div>
        </motion.form>
      </div>
    </div>
  );
}
