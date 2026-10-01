import { useId, type ComponentType, type FormEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Info, type LucideProps } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ChoiceCards, type ChoiceOption } from '../components/form/ChoiceCards';
import { FormCard } from '../components/form/FormCard';
import { FormField } from '../components/form/FormField';
import { BlazerIcon, ButtonShirtIcon, JeansIcon, TrousersIcon, TShirtIcon } from '../components/icons/clothingIcons';
import { useClothingSelectionForm } from '../hooks/useClothingSelectionForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowActions, FlowStepForm, FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ClothingType, FitPreference, Gender } from '../types/domain';
import {
  CLOTHING_CATEGORIES,
  CLOTHING_ITEMS,
  FIT_DEFINITIONS,
  type ClothingSelectionField,
  getClothingItem,
} from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import './ClothingSelectionPage.css';

const TITLE_ID = 'clothing-title';

const FIELD_IDS: Record<ClothingSelectionField, string> = {
  type: 'clothing-type',
  fit: 'clothing-fit',
};

const CLOTHING_ICONS: Record<ClothingType, ComponentType<LucideProps>> = {
  't-shirt': TShirtIcon,
  shirt: ButtonShirtIcon,
  jeans: JeansIcon,
  trousers: TrousersIcon,
  blazer: BlazerIcon,
};

const SIZING_RANGE_LABEL: Record<Gender, string> = {
  men: "Men's sizing",
  women: "Women's sizing",
  children: "Children's sizing (10+)",
};

/** Clothing options grouped by category, in catalog order. */
const CLOTHING_GROUPS = CLOTHING_CATEGORIES.map((category) => ({
  ...category,
  options: CLOTHING_ITEMS.filter((item) => item.category === category.id).map(
    (item): ChoiceOption<ClothingType> => ({
      value: item.type,
      label: item.label,
      description: item.description,
      icon: CLOTHING_ICONS[item.type],
    }),
  ),
}));

/** Step 2 of the fit flow: which clothing item to size, and the preferred fit where it applies. */
export function ClothingSelectionPage() {
  useDocumentTitle(pageTitle('Clothing selection'));
  const navigate = useNavigate();
  const gender = useAppStore((s) => s.userInfo.gender);
  const { draft, availableFits, visibleErrors: errors, selectType, selectFit, submit } = useClothingSelectionForm();
  const clothingRadioName = useId();

  const selectedItem = draft.type ? getClothingItem(draft.type) : null;
  const fitOptions: ChoiceOption<FitPreference>[] = availableFits.map((fit) => FIT_DEFINITIONS[fit]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstInvalid = submit();
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    navigate(PATHS.scan);
  };

  return (
    <FlowStepLayout
      step={2}
      stepLabel="Clothing"
      titleId={TITLE_ID}
      title={
        <>
          What are you <span className="flow-step__title-accent">shopping for?</span>
        </>
      }
      lead="Choose the clothing item you want to find the perfect fit for. It tells SizerAI which measurements and fit details to focus on in the next steps."
      introExtra={
        gender && (
          <p className="clothing__context">
            <span className="clothing__context-label">Sizing range</span>
            <span className="clothing__context-value">{SIZING_RANGE_LABEL[gender]}</span>
          </p>
        )
      }
    >
      <FlowStepForm titleId={TITLE_ID} onSubmit={handleSubmit}>
        <FormCard titleId="clothing-item-title" title="Clothing item" subtitle="Pick one item. You can change it later.">
          <FormField label="Clothing item" group hideLabel error={errors.type} controlId={FIELD_IDS.type}>
            {({ id, describedBy, invalid }) => (
              <div className="clothing__groups">
                {CLOTHING_GROUPS.map((group, index) => (
                  <div key={group.id} className="clothing__group" role="group" aria-labelledby={`clothing-group-${group.id}`}>
                    <p id={`clothing-group-${group.id}`} className="clothing__group-label">
                      {group.label}
                    </p>
                    <ChoiceCards
                      name={clothingRadioName}
                      className="clothing__cards"
                      options={group.options}
                      value={draft.type}
                      onChange={selectType}
                      firstId={index === 0 ? id : undefined}
                      describedBy={describedBy}
                      invalid={invalid}
                    />
                  </div>
                ))}
              </div>
            )}
          </FormField>
        </FormCard>

        <AnimatePresence initial={false}>
          {selectedItem && fitOptions.length > 0 && (
            <FormCard
              key="fit"
              titleId="clothing-fit-title"
              title="Preferred fit"
              subtitle="Fit preference shapes the style of your recommendation, from close-fitting to roomy. It does not change your measurements."
            >
              <FormField
                label={`Fit for ${selectedItem.label.toLowerCase()}`}
                hint={selectedItem.fitNote}
                group
                error={errors.fit}
                controlId={FIELD_IDS.fit}
              >
                {({ id, describedBy, invalid }) => (
                  <ChoiceCards
                    className={`clothing__fits clothing__fits--${fitOptions.length}`}
                    options={fitOptions}
                    value={draft.fit}
                    onChange={selectFit}
                    firstId={id}
                    describedBy={describedBy}
                    invalid={invalid}
                  />
                )}
              </FormField>
            </FormCard>
          )}
        </AnimatePresence>

        {!selectedItem && (
          <p className="clothing__fit-hint">
            <Info aria-hidden="true" size={16} strokeWidth={2} />
            Choose an item to see the fit options for it.
          </p>
        )}

        <FlowActions backTo={PATHS.userInfo} />
      </FlowStepForm>
    </FlowStepLayout>
  );
}
