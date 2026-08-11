import React, {useEffect} from 'react';
import {CUSTOM_FIELD_OPERATORS, CUSTOM_FIELD_SET_OPERATORS} from './member-fields';
import {FilterSegmentInput, FilterSegmentSelect} from '@tryghost/shade/patterns';
import {createOperatorOptions} from '@/shared/filters';
import {useBrowseMemberCustomFields, userTypeForFieldType} from '@tryghost/admin-x-framework/api/member-custom-fields';
import type {CustomRendererProps} from '@tryghost/shade/patterns';

// The dropdown entry has already chosen the field (its key is in `field.key` as
// `custom_field.<key>`), so this renders only what's left in the pill: for a
// composite field a part selector (with "Any" for the whole field), then the
// operator, then the value. The predicate carries [subfield, value]; subfield is ''
// for a scalar field or the "Any" whole-field set/unset case. The operator lives here
// because its valid set depends on the part chosen here.

const KEY_PREFIX = 'custom_field.';

// A composite field's parts, sourced from the type's presentation so labels and keys
// stay in one place; empty for a scalar field.
function partsOf(type?: string): Array<{value: string; label: string}> {
    if (!type) {
        return [];
    }
    const subFields = userTypeForFieldType(type as Parameters<typeof userTypeForFieldType>[0]).subFields ?? {};
    return Object.entries(subFields).map(([value, label]) => ({value, label}));
}

const CustomFieldFilterRenderer: React.FC<CustomRendererProps<string>> = ({field, values, onChange, operator, onOperatorChange}) => {
    const {data} = useBrowseMemberCustomFields();
    const definitions = data?.members_custom_fields ?? [];

    const fieldKey = (field.key ?? '').slice(KEY_PREFIX.length);
    const definition = definitions.find(candidate => candidate.key === fieldKey);
    const parts = partsOf(definition?.type);
    const isComposite = parts.length > 0;

    const [subfield = '', value = ''] = values;
    const isWholeField = subfield === '';

    // A composite's "Any" (whole field) only supports set / not-set — "Any contains X"
    // is meaningless. A specific part, and a scalar field, support the value operators
    // and set / not-set. Only "Any" restricts the set, so only it needs the operator
    // coerced when the part selection changes — done in an effect rather than the change
    // handler, because the framework's filter update reads a stale list within a tick, so
    // a value change and an operator change can't both land in the same one.
    const operators = isComposite && isWholeField
        ? CUSTOM_FIELD_SET_OPERATORS
        : CUSTOM_FIELD_OPERATORS;

    useEffect(() => {
        if (!onOperatorChange || operators.includes(operator)) {
            return;
        }
        onOperatorChange('is-set');
    }, [operator, operators, onOperatorChange]);

    const needsValue = !CUSTOM_FIELD_SET_OPERATORS.includes(operator);
    const partOptions = [{value: '', label: 'Any'}, ...parts];

    return (
        <>
            {isComposite && (
                <FilterSegmentSelect
                    ariaLabel="Field part"
                    options={partOptions}
                    testId="custom-field-filter-subfield"
                    value={subfield}
                    onChange={nextSubfield => onChange([nextSubfield, value])}
                />
            )}

            {onOperatorChange && (
                <FilterSegmentSelect
                    ariaLabel="Operator"
                    options={createOperatorOptions(operators)}
                    testId="custom-field-filter-operator"
                    value={operator}
                    onChange={onOperatorChange}
                />
            )}

            {needsValue && (
                <FilterSegmentInput
                    ariaLabel="Value"
                    placeholder="Enter value..."
                    testId="custom-field-filter-value"
                    value={value}
                    onChange={nextValue => onChange([subfield, nextValue])}
                />
            )}
        </>
    );
};

export default CustomFieldFilterRenderer;
