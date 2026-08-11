import {isCustomFieldColumn, type MemberCustomFieldCsvColumn} from '@tryghost/admin-x-framework/api/member-custom-fields';

type FieldMappingOptions = {
    importMemberTier?: boolean;
    // Custom field CSV columns auto-detection should recognise (see memberCustomFieldCsvColumns);
    // empty when the feature is off.
    customFieldColumns?: MemberCustomFieldCsvColumn[];
};

export const FIELD_MAPPINGS = [
    {label: 'Email', value: 'email'},
    {label: 'Name', value: 'name'},
    {label: 'Note', value: 'note'},
    {label: 'Subscribed to emails', value: 'subscribed_to_emails'},
    {label: 'Stripe Customer ID', value: 'stripe_customer_id'},
    {label: 'Complimentary plan', value: 'complimentary_plan'},
    {label: 'Labels', value: 'labels'},
    {label: 'Created at', value: 'created_at'},
    {label: 'Gift ID', value: 'gift_id'}
];

const IMPORT_TIER_FIELD_MAPPING = {label: 'Tier', value: 'import_tier'};

const SUPPORTED_TYPES = [
    'email',
    'name',
    'note',
    'subscribed_to_emails',
    'complimentary_plan',
    'stripe_customer_id',
    'labels',
    'created_at',
    'gift_id'
];

function getSupportedTypes({importMemberTier = false, customFieldColumns = []}: FieldMappingOptions = {}): string[] {
    return [
        ...SUPPORTED_TYPES,
        ...(importMemberTier ? [IMPORT_TIER_FIELD_MAPPING.value] : []),
        ...customFieldColumns.map(column => column.value)
    ];
}

// The native targets only. Custom fields are offered from their own list, chosen by kind, so
// they are not folded in here — auto-detection still sees both, through getSupportedTypes.
export function getFieldMappings({importMemberTier = false}: Pick<FieldMappingOptions, 'importMemberTier'> = {}) {
    return [
        ...FIELD_MAPPINGS,
        ...(importMemberTier ? [IMPORT_TIER_FIELD_MAPPING] : [])
    ];
}

const AUTO_DETECTED_TYPES = ['email'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every column the file has.
 *
 * Papaparse omits keys for a row carrying fewer cells than the header rather than padding it
 * out, so the first row is only the full set for a rectangular file. A hand-edited or partly
 * exported CSV whose first row is short would otherwise have its remaining columns go
 * undetected — and a column nothing names is carried through by the importer, so it would be
 * imported without ever appearing to the publisher.
 *
 * `__parsed_extra` is where papaparse collects the overflow of a row with more cells than
 * headers. It is not a column and no mapping can name it.
 */
function columnsOf(data: Record<string, string>[]): string[] {
    const keys = new Set<string>();
    for (const row of data) {
        for (const key of Object.keys(row)) {
            if (key !== '__parsed_extra') {
                keys.add(key);
            }
        }
    }
    return [...keys];
}

// Re-exported, not re-declared: state.ts and reducer.ts are shared with the baseline and type
// `state.mapping` against the baseline's class. A second declaration carrying a private field
// is a distinct type to TypeScript however identical its shape, so copying it here would make
// this modal unable to hand its own mapping to the reducer it dispatches to.
export {MembersFieldMapping} from '@/members/components/bulk-action-modals/import-members/mapping';

/**
 * Locate 10 non-empty cells from the start/middle(ish)/end of each column (30 non-empty values in total).
 * If the data contains 30 rows or fewer, all rows should be validated.
 */
export function sampleData(data: Record<string, string>[], validationSampleSize = 30): Record<string, string>[] {
    if (!data || data.length <= validationSampleSize) {
        return data;
    }

    const validatedSet: Record<string, string>[] = [];
    const sampleKeys = columnsOf(data);

    sampleKeys.forEach((key) => {
        const nonEmptyKeyEntries = data.filter(entry => entry[key] && entry[key].trim() !== '');
        let sampledEntries: Record<string, string>[] = [];

        if (nonEmptyKeyEntries.length <= validationSampleSize) {
            sampledEntries = nonEmptyKeyEntries;
        } else {
            const headSize = Math.floor(validationSampleSize / 3);
            const tailSize = headSize;
            const middleSize = validationSampleSize - headSize - tailSize;

            const head = nonEmptyKeyEntries.slice(0, headSize);
            const tail = tailSize > 0 ? nonEmptyKeyEntries.slice(-tailSize) : [];
            const middleStart = Math.max(0, Math.floor(nonEmptyKeyEntries.length / 2) - Math.floor(middleSize / 2));
            const middle = nonEmptyKeyEntries.slice(middleStart, middleStart + middleSize);

            sampledEntries = [...head, ...middle, ...tail].slice(0, validationSampleSize);
        }

        sampledEntries.forEach((entry, index) => {
            if (!validatedSet[index]) {
                validatedSet[index] = {};
            }
            validatedSet[index][key] = entry[key];
        });
    });

    return validatedSet;
}

/**
 * Detects supported data types and auto-detects email by value.
 *
 * Returned mapping object contains mappings accepted by the members upload API.
 */
export function detectFieldTypes(data: Record<string, string>[], options: FieldMappingOptions = {}): Record<string, string> {
    const sampledData = sampleData(data);
    const mapping: Record<string, string> = {};
    const supportedTypes = getSupportedTypes(options);

    // Match column headers against supported types using all headers from the original data.
    // sampleData only keeps keys with non-empty values, so entirely-empty columns (e.g. an empty
    // "note" column) would be missed if we only checked sampled entries. A custom field column
    // auto-maps to itself here; isCustomFieldColumn holds it apart from the fuzzy core-field
    // heuristics below.
    if (data.length > 0) {
        for (const key of columnsOf(data)) {
            if (!mapping.name && /name/i.test(key) && !isCustomFieldColumn(key)) {
                mapping.name = key;
                continue;
            }

            if (!mapping[key] && supportedTypes.includes(key) && !AUTO_DETECTED_TYPES.includes(key)) {
                mapping[key] = key;
            }
        }
    }

    // Detect value-based types (email) from sampled data.
    let i = 0;
    while (i <= sampledData.length - 1) {
        if (mapping.email) {
            break;
        }

        const entry = sampledData[i];
        for (const [key, value] of Object.entries(entry)) {
            if (!mapping.email && value && EMAIL_REGEX.test(value) && !isCustomFieldColumn(key)) {
                mapping.email = key;
            }
        }

        i += 1;
    }

    return mapping;
}

/**
 * The field name to suggest for a column no defined field matches.
 *
 * A namespaced column comes from a Ghost export, so it carries a namespace that is noise
 * to a publisher and a key that was machine-minted from a name in the first place: both
 * are stripped back towards what someone would have typed. A column from anywhere else is
 * already the publisher's own wording, so only its separators and first letter are
 * touched. It is a starting point either way, and the form lets them edit it.
 */
export function suggestedFieldName(column: string): string {
    // A custom field column is `custom_fields.<key>` or `custom_fields.<key>.<part>`. The name
    // being suggested is the field's, so the part is dropped: `custom_fields.home-address.city`
    // names a field called "Home address" whose City part this column holds, and the part is
    // asked for separately. A bare `custom_fields` column has no key, so it suggests the namespace itself.
    const segments = isCustomFieldColumn(column) ? column.split('.').slice(1, 2) : [column];
    const words = (segments[0] ?? column).replace(/[._-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatImportError(error: string): string {
    return error
        .replace(
            'Value in [members.email] cannot be blank.',
            'Missing email address'
        )
        .replace(
            'Value in [members.note] exceeds maximum length of 2000 characters.',
            'Note is too long'
        )
        .replace(
            'Value in [members.subscribed] must be one of true, false, 0 or 1.',
            'Value of "Subscribed to emails" must be "true" or "false"'
        )
        .replace(
            'Validation (isEmail) failed for email',
            'Invalid email address'
        )
        .replace(
            // Runs to the end: this is handed one reason, and Stripe puts the customer id
            // after the colon.
            /No such customer:[\s\S]*/,
            'Could not find Stripe customer'
        );
}
