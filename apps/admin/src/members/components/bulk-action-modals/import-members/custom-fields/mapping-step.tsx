import {Button, Checkbox, DialogFooter, LoadingIndicator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@tryghost/shade/components';
import {CreateFieldForm} from '@/members/components/bulk-action-modals/import-members/custom-fields/create-field-form';
import {FieldPicker} from '@/members/components/bulk-action-modals/import-members/custom-fields/field-picker';
import {LabelPicker} from '@/members/label-picker';
import {LucideIcon, cn, formatNumber} from '@tryghost/shade/utils';
import {MembersFieldMapping} from '@/members/components/bulk-action-modals/import-members/custom-fields/mapping';
import {Fragment, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {type MemberCustomField, type MemberCustomFieldCsvColumn} from '@tryghost/admin-x-framework/api/member-custom-fields';
import {type UseLabelPickerResult} from '@/members/hooks/use-label-picker';

interface MappingPreviewRow {
    key: string;
    value: string;
    mapTo: string | null;
}

// An import the table refuses to send: why, and which columns are to blame. One value rather
// than two, because a message shown with the wrong rows marked is worse than either alone.
interface IncompleteImport {
    message: string;
    columns: ReadonlySet<string>;
}

interface MappingStepProps {
    status: 'MAPPING' | 'UPLOADING';
    fileData: Record<string, string>[] | null;
    mapping: MembersFieldMapping | null;
    mappingError: string | null;
    showMappingErrors: boolean;
    membersCount: number;
    dataPreviewIndex: number;
    hasPrevRecord: boolean;
    hasNextRecord: boolean;
    fieldMappings: {label: string; value: string}[];
    customFieldMappings: MemberCustomFieldCsvColumn[];
    labelPicker: UseLabelPickerResult;
    onUpdateMapping: (from: string, to: string | null) => void;
    onFieldCreated: (columnKey: string, field: MemberCustomField, column: string | null) => void;
    onDataPreviewIndexChange: (next: number) => void;
    onStartOver: () => void;
    // Whether a column has been switched in or out of the import, which is the one decision
    // this table keeps to itself. Everything else the publisher changes goes through
    // onUpdateMapping, so between them the modal knows if there is anything to lose.
    onColumnsChanged: () => void;
    // Carries what the import should write, column by column. The table is the only thing
    // that knows both the mapping and which columns are in the import, so it says the whole
    // of it rather than handing over a correction to apply.
    onUpload: (importMapping: Record<string, string | null>) => void;
}

// A set with one member added or removed, since both halves of the in-or-out decision below
// are held as memberships.
function toggled(set: ReadonlySet<string>, key: string, present: boolean): ReadonlySet<string> {
    const next = new Set(set);
    if (present) {
        next.add(key);
    } else {
        next.delete(key);
    }
    return next;
}

export function MappingStep({
    status,
    fileData,
    mapping,
    mappingError,
    showMappingErrors,
    membersCount,
    dataPreviewIndex,
    hasPrevRecord,
    hasNextRecord,
    fieldMappings,
    customFieldMappings,
    labelPicker,
    onUpdateMapping,
    onFieldCreated,
    onDataPreviewIndexChange,
    onStartOver,
    onColumnsChanged,
    onUpload
}: MappingStepProps) {
    // Columns switched on without a target yet, and columns switched off that still have one.
    // Between them and the mapping, a column is either in the import or out of it — and what it
    // was mapped to survives being switched off, because that is a different decision.
    const [pendingColumns, setPendingColumns] = useState<ReadonlySet<string>>(new Set());
    const [excludedColumns, setExcludedColumns] = useState<ReadonlySet<string>>(new Set());
    // Raised when Import is pressed on a table that cannot be imported, and cleared by any
    // answer to it. Set afresh on every press, so pressing Import again scrolls back to the
    // first offender below rather than sitting inert.
    const [incomplete, setIncomplete] = useState<IncompleteImport | null>(null);

    // Each row's field picker, so a refusal can bring the column it names into view. A long
    // file scrolls, and naming a column the publisher would have to go looking for is barely
    // better than not naming it.
    const fieldTriggers = useRef(new Map<string, HTMLElement>());

    // After the refusal has rendered rather than while handling the click: the message appears
    // below the table and takes its height from it, so scrolling first would aim at a table
    // that is about to get shorter and leave the row half under the new bottom edge. Layout,
    // not effect, so it lands before the frame the message arrives in is painted.
    useLayoutEffect(() => {
        const [firstUndecided] = incomplete?.columns ?? [];
        if (!firstUndecided) {
            return;
        }
        // 'nearest' scrolls only as far as it has to, leaving a column already in view where
        // it was; scroll-my on the trigger keeps it off the edge it arrives at.
        fieldTriggers.current.get(firstUndecided)?.scrollIntoView({
            block: 'nearest',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    }, [incomplete]);

    // The column whose create form is open, shown as a row beneath that column's own. Held
    // here rather than by the modal, which only ever forwarded it, so it clears with the
    // table on Start over instead of outliving the file it belonged to.
    const [createFieldForColumn, setCreateFieldForColumn] = useState<string | null>(null);

    // Which row's field picker is open, and what it is filtered by. Held here rather than in
    // each picker because creating a composite has to reopen the picker it was launched from,
    // filtered to the field just made — and only one can be open at a time regardless.
    const [openPicker, setOpenPicker] = useState<{columnKey: string; search: string} | null>(null);

    // Opening a row's picker puts the create form away: the publisher has moved on to another
    // decision, and leaving it open would strand a half-filled form under someone else's
    // dropdown. The form's own selects live inside it and are unaffected.
    const showPicker = (columnKey: string, search: string) => {
        setCreateFieldForColumn(null);
        setOpenPicker({columnKey, search});
    };

    // A target belongs to one column, so mapping it here takes it from whichever column held
    // it. That column keeps its place in the import with the field still to answer: it did not
    // ask to lose anything, and should not silently drop out of the import with nothing said.
    const claimTarget = (row: MappingPreviewRow, target: string) => {
        const previousHolder = mapping?.getKeyByValue(target);
        if (previousHolder && previousHolder !== row.key) {
            setPendingColumns(previous => toggled(previous, previousHolder, true));
        }
        onUpdateMapping(row.key, target);
    };

    const isImported = (row: MappingPreviewRow) => !excludedColumns.has(row.key)
        && (Boolean(row.mapTo) || pendingColumns.has(row.key));

    // Switching a column off leaves its field alone: excluding a column from this import and
    // choosing what it holds are different answers, and switching it back on should not make
    // the publisher pick again.
    const setImported = (row: MappingPreviewRow, imported: boolean) => {
        setIncomplete(null);
        onColumnsChanged();
        setExcludedColumns(previous => toggled(previous, row.key, !imported));
        setPendingColumns(previous => toggled(previous, row.key, imported && !row.mapTo));
        if (!imported && createFieldForColumn === row.key) {
            setCreateFieldForColumn(null);
        }
    };

    // Both refusals read the same way, and the mapping error wins: a file with no email column
    // cannot be imported at all, whereas an undecided column is one answer away.
    // Gated as the shipped step gates it, deliberately. The gate is dead — it only opens when
    // Import is pressed, and that button is disabled in the one state that sets a mapping error
    // — but opening it changes nothing a publisher can reach: papaparse does not throw, so the
    // parse and read messages behind it cannot fire, and the empty-file case the table already
    // reports in its own body. Left matching the shipped import until csv.ts stops discarding
    // papaparse's errors, which is what would make any of these reachable. See BER ticket.
    const visibleError = (showMappingErrors && mappingError) || incomplete?.message;
    // A refusal that names columns is marked on their own selects, so the table is left alone:
    // reddening the whole of it would point at every row for the sake of one. Every other
    // refusal is about the file rather than a row anyone can be sent to, so the table carries it.
    const tableError = Boolean(visibleError) && !incomplete?.columns.size;

    const columnCount = 4;

    // Every column the file has, not the ones the previewed row happens to carry. Papaparse
    // omits keys for a row with fewer cells than the header, so reading columns off a single row
    // lets a ragged CSV hide one from the table entirely — and a column the mapping never names
    // is carried through by the importer rather than left out, which is the opposite of what a
    // publisher who never saw it would expect. The preview index chooses which values are shown;
    // it must never decide which columns exist.
    const columnKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const row of fileData ?? []) {
            for (const key of Object.keys(row)) {
                // Where papaparse collects the overflow of a row with more cells than headers.
                // It is not a column, and no mapping can name it.
                if (key !== '__parsed_extra') {
                    keys.add(key);
                }
            }
        }
        return [...keys];
    }, [fileData]);

    const currentlyDisplayedData: MappingPreviewRow[] = mapping
        ? columnKeys.map(key => ({
            key,
            value: fileData?.[dataPreviewIndex]?.[key] ?? '',
            mapTo: mapping.get(key)
        }))
        : [];

    // What this import writes: one entry per column in the file — the field it fills, empty for
    // a column left out, or null for a column in the import with no field chosen yet.
    // Everything asking what is being imported reads this one value, so the checks below and
    // the request itself cannot disagree.
    //
    // Empty rather than omitted, because the importer carries a column the mapping does not
    // name through under its own header — which is how an unnamed custom_fields.* column
    // survives to be read. Leaving a column out of the mapping is the opposite of leaving it
    // out of the import.
    const importMapping: Record<string, string | null> = Object.fromEntries(
        currentlyDisplayedData.map(row => [row.key, isImported(row) ? row.mapTo : ''])
    );

    // What refuses this import, read off the mapping actually being sent. With custom fields
    // on it is answered here, because this is the only place that knows both the mapping and
    // which columns are in the import. A file-level problem (empty, unreadable) is the modal's
    // to report and it refuses the upload itself, so nothing about the mapping is worth saying
    // ahead of it.
    //
    // Off, both checks belong to the modal exactly as they always did.
    const importRefusal = (): IncompleteImport | null => {
        if (mappingError) {
            return null;
        }

        if (!Object.values(importMapping).includes('email')) {
            return {
                message: 'Please map "Email" to one of the fields in the CSV, and make sure it is selected.',
                columns: new Set()
            };
        }

        // Null is a column in the import with nothing chosen for it, which is the one state
        // the table can hold that cannot be sent.
        const undecided = Object.keys(importMapping).filter(column => importMapping[column] === null);
        if (undecided.length === 0) {
            return null;
        }

        return {
            message: `Choose a field for ${undecided.map(column => `"${column}"`).join(', ')}, or deselect ${undecided.length === 1 ? 'it' : 'them'}.`,
            columns: new Set(undecided)
        };
    };

    const handleImport = () => {
        const refusal = importRefusal();
        if (refusal) {
            setIncomplete(refusal);
            return;
        }
        onUpload(importMapping);
    };

    return (
        <>
            {/* A flex column inside the height-bounded dialog: the table box below grows into
                whatever room is left, so a short file keeps a small modal and a long one
                fills the viewport rather than scrolling inside a fixed 400px. */}
            <div className="mt-5 flex min-h-0 flex-1 flex-col space-y-5">
                {fileData === null ? (
                    <div className="flex items-center justify-center rounded-md border bg-muted p-10">
                        <LoadingIndicator size="md" />
                    </div>
                ) : (
                    <>
                        <div className={cn(
                            'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border',
                            tableError && 'border-destructive'
                        )}>
                            <div className="min-h-0 flex-1 overflow-auto">
                                <Table className="table-fixed">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <span className="sr-only">Import this column</span>
                                            </TableHead>
                                            <TableHead className="w-[26%]">Field</TableHead>
                                            <TableHead className="w-[30%]">
                                                <div className="flex items-center justify-between">
                                                    <span>
                                                        Sample data <span className="text-muted-foreground">(#{formatNumber(dataPreviewIndex + 1)})</span>
                                                    </span>
                                                    <div className="flex items-center">
                                                        <button
                                                            aria-label="Show previous sample row"
                                                            className={cn(
                                                                'rounded p-0.5 hover:bg-muted',
                                                                !hasPrevRecord && 'cursor-default opacity-30'
                                                            )}
                                                            disabled={!hasPrevRecord || status === 'UPLOADING'}
                                                            type="button"
                                                            onClick={() => onDataPreviewIndexChange(dataPreviewIndex - 1)}
                                                        >
                                                            <LucideIcon.ChevronLeft className="size-4" />
                                                        </button>
                                                        <button
                                                            aria-label="Show next sample row"
                                                            className={cn(
                                                                'rounded p-0.5 hover:bg-muted',
                                                                !hasNextRecord && 'cursor-default opacity-30'
                                                            )}
                                                            disabled={!hasNextRecord || status === 'UPLOADING'}
                                                            type="button"
                                                            onClick={() => onDataPreviewIndexChange(dataPreviewIndex + 1)}
                                                        >
                                                            <LucideIcon.ChevronRight className="size-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </TableHead>
                                            <TableHead className="w-[38%]">Import as</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {currentlyDisplayedData.length > 0 ? (
                                            currentlyDisplayedData.map(row => (
                                                <Fragment key={row.key}>
                                                {/* While a create form is open, the rows it doesn't concern step back, so
                                                    the pair being worked on reads as the foreground without anything being
                                                    covered. Opacity on the rows themselves, not a layer over them. */}
                                                {/* A row that is out of the import is tinted rather than
                                                    faded. Alpha on the token, not opacity on the row: at
                                                    full strength it read as heavier than the rows that
                                                    matter, and fading the row instead took the field
                                                    control's border down with it. Fading is left for the
                                                    create form, where dropping everything back is the
                                                    point.

                                                    No row hover: Shade paints it onto each cell through
                                                    group-hover, so it is turned off there. Nothing here
                                                    responds to a row being pointed at — the controls in
                                                    it have their own hover — and the hover token is
                                                    lighter than the tint above, so on a row out of the
                                                    import it read as the row coming back to life. */}
                                                <TableRow className={cn(
                                                    'transition-opacity [&>td]:group-hover:bg-transparent',
                                                    !isImported(row) && 'bg-muted/50',
                                                    createFieldForColumn && createFieldForColumn !== row.key && 'opacity-40'
                                                )}>
                                                    <TableCell>
                                                        <Checkbox
                                                            aria-label={`Import ${row.key}`}
                                                            checked={isImported(row)}
                                                            disabled={status === 'UPLOADING'}
                                                            onCheckedChange={checked => setImported(row, checked === true)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className={cn('text-sm font-medium break-all', !isImported(row) && 'text-muted-foreground')}>{row.key}</TableCell>
                                                    <TableCell className={cn('text-sm break-all', (!row.value || !isImported(row)) && 'text-muted-foreground')}>
                                                        {row.value || '\u00A0'}
                                                    </TableCell>
                                                    <TableCell>
                                                    {/* Hidden rather than unmounted for a column out of the
                                                        import: the control it would offer cannot be used, and a
                                                        disabled one has to be styled, faded and explained.
                                                        visibility keeps its box, so the row does not change
                                                        height as columns go in and out, and takes it out of the
                                                        tab order and out of reach of the pointer without a
                                                        second mechanism. The mapping is not lost either way —
                                                        it comes back with the row when it is selected again. */}
                                                        <FieldPicker
                                                            className={cn(!isImported(row) && 'invisible')}
                                                            columnKey={row.key}
                                                            customFieldMappings={customFieldMappings}
                                                            disabled={status === 'UPLOADING'}
                                                            fieldMappings={fieldMappings}
                                                            invalid={incomplete?.columns.has(row.key)}
                                                            open={openPicker?.columnKey === row.key}
                                                            search={openPicker?.columnKey === row.key ? openPicker.search : ''}
                                                            triggerRef={(node) => {
                                                                if (node) {
                                                                    fieldTriggers.current.set(row.key, node);
                                                                } else {
                                                                    fieldTriggers.current.delete(row.key);
                                                                }
                                                            }}
                                                            value={row.mapTo}
                                                            onCreateField={() => setCreateFieldForColumn(row.key)}
                                                            onOpenChange={next => (next ? showPicker(row.key, '') : setOpenPicker(null))}
                                                            onSearchChange={search => setOpenPicker({columnKey: row.key, search})}
                                                            onSelect={(target) => {
                                                                setIncomplete(null);
                                                                claimTarget(row, target);
                                                            }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                                {/* The create form is a row of the table rather than a layer over it, so it
                                                    scrolls with the rows, needs no anchoring or collision handling, and can't
                                                    be scrolled out from under itself. It follows the row it belongs to, which
                                                    keeps that column's name and sample value in view while deciding. */}
                                                {createFieldForColumn === row.key && (
                                                    <TableRow className="bg-transparent hover:bg-transparent">
                                                        <TableCell className="p-2" colSpan={columnCount}>
                                                            {/* Raised rather than floating: it reads as a surface above the table
                                                                while remaining a row of it, so nothing has to be anchored to the
                                                                row or repositioned when the table scrolls. */}
                                                            <div className="rounded-lg border bg-surface-elevated-2 p-3 shadow-lg">
                                                            <CreateFieldForm
                                                                columnKey={row.key}
                                                                onCancel={() => setCreateFieldForColumn(null)}
                                                                onCreated={(field, column) => {
                                                                    onFieldCreated(row.key, field, column);
                                                                    setCreateFieldForColumn(null);
                                                                    // Creating a field for a column the import was refused over
                                                                    // is an answer to that refusal, so it clears with the others.
                                                                    // A composite is not answered yet — its part is still to
                                                                    // choose — but the message named a column, not a part, and
                                                                    // leaving it up would keep pointing at a row that has moved on.
                                                                    setIncomplete(null);
                                                                    // A composite spans several columns, so which of them this
                                                                    // one holds is still open. Asked in the picker, filtered to
                                                                    // the new field: the same question as any other mapping,
                                                                    // rather than a third control on the form for the one type
                                                                    // that needs it.
                                                                    if (!column) {
                                                                        showPicker(row.key, field.name);
                                                                    }
                                                                }}
                                                            />
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell className="text-muted-foreground" colSpan={columnCount}>
                                                    No data found in the uploaded CSV.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {visibleError && <p className="text-sm text-destructive">{visibleError}</p>}

                        {membersCount > 0 && (
                            <p className="text-sm text-muted-foreground">
                                If an email address in your CSV matches an existing member, they will be updated with the mapped values.
                            </p>
                        )}

                        <div className="mt-5">
                            <label className="mb-1 block text-sm font-semibold">Label these members</label>
                            <LabelPicker
                                isCreating={labelPicker.isCreating}
                                labels={labelPicker.labels}
                                optionSource={labelPicker.optionSource}
                                resolvedSelectedLabels={labelPicker.resolvedSelectedLabels}
                                selectedSlugs={labelPicker.selectedSlugs}
                                onCreate={labelPicker.createLabel}
                                onDelete={labelPicker.deleteLabel}
                                onEdit={labelPicker.editLabel}
                                onToggle={labelPicker.toggleLabel}
                            />
                        </div>
                    </>
                )}
            </div>

            <DialogFooter className="mt-5">
                <Button
                    disabled={status === 'UPLOADING'}
                    variant="outline"
                    onClick={onStartOver}
                >
                    Start over
                </Button>
                <Button
                    disabled={status === 'UPLOADING' || membersCount === 0}
                    onClick={handleImport}
                >
                    {status === 'UPLOADING' ? (
                        <span className="flex items-center gap-2">
                            <LoadingIndicator color="light" size="sm" />
                            Uploading
                        </span>
                    ) : membersCount > 0 ? (
                        `Import ${formatNumber(membersCount)} ${membersCount === 1 ? 'member' : 'members'}`
                    ) : (
                        'Import members'
                    )}
                </Button>
            </DialogFooter>
        </>
    );
}
