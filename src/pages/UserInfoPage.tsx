import type { FormEvent } from 'react';
import { Mars, ShieldCheck, Smile, Venus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DemoBadge } from '../components/demo/DemoModeBanner';
import { useAppStore } from '../store/useAppStore';
import { ChoiceCards, type ChoiceOption } from '../components/form/ChoiceCards';
import { FormCard } from '../components/form/FormCard';
import { FormField } from '../components/form/FormField';
import { SegmentedControl, type SegmentOption } from '../components/form/SegmentedControl';
import { TextInput } from '../components/form/TextInput';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useUserInfoForm } from '../hooks/useUserInfoForm';
import { FlowActions, FlowStepForm, FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import type { Gender, HeightUnit, WeightUnit } from '../types/domain';
import { pageTitle } from '../utils/constants';
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
  const demoMode = useAppStore((s) => s.demoMode);
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
    <FlowStepLayout
      step={1}
      stepLabel="Your details"
      titleId="user-info-title"
      title={
        <>
          Let's build your <span className="flow-step__title-accent">fit profile.</span>
        </>
      }
      lead="Tell us a little about yourself so SizerAI can personalize your fit recommendations."
      introExtra={
        <>
          {demoMode && (
            <div className="demo-notice user-info__demo">
              <DemoBadge />
              <p>
                <strong>Sample details for the demo.</strong> “Demo User” is fictional demonstration data — change any
                field if you like.
              </p>
            </div>
          )}
          <div className="user-info__privacy">
            <ShieldCheck className="user-info__privacy-icon" aria-hidden="true" size={20} strokeWidth={1.75} />
            <p>
              <strong>Private by design.</strong> Your details stay in this browser tab for this session. Nothing you
              enter here is uploaded.
            </p>
          </div>
        </>
      }
    >
      <FlowStepForm titleId="user-info-title" onSubmit={handleSubmit}>
        <FormCard titleId="about-you-title" title="About you" subtitle="Who this fit profile is for.">
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
        </FormCard>

        <FormCard
          titleId="basics-title"
          title="Your basics"
          subtitle="Self-reported values. We use them as a starting point, not as body measurements."
        >

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
        </FormCard>

        <FlowActions backTo={PATHS.home} />
      </FlowStepForm>
    </FlowStepLayout>
  );
}
