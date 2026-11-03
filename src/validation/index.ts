export {
  ACTIVITY_MONITOR,
  CALIBRATIONS,
  SIMULATED_ACCLIMATION_HOURS,
  UnsupportedTargetError,
  assayFor,
  assaySetup,
  observeFly,
  type Assay,
  type FlyRecording,
  type FlyRunOptions,
  type AssayCalibration,
  type StudySetup,
} from "./assays";
export {
  observeRun,
  type BeamCrossingSettings,
  type BeamObservation,
  type InstrumentSettings,
  type Observation,
  type VideoObservation,
  type VideoTrackingSettings,
} from "./instruments";
export {
  activeBins,
  poolBouts,
  scoreActivity,
  scoreObservation,
  type Bout,
  type ScoredActivity,
  type ScoringRule,
} from "./scoring";
export {
  EvidencePackError,
  countedTargets,
  readEvidencePack,
  tuningPack,
  type EvidencePack,
  type ValidationTarget,
} from "./evidencePack";
export { VALIDATION_SEEDS, runValidation, type ValidationOptions } from "./runValidation";
export * from "./report";
export {
  disagreementOf,
  poolDisagreement,
  vigilanceRecord,
  type Disagreement,
  type DisagreementMeasure,
  type VigilanceRecord,
} from "./disagreement";
export {
  BOUT_SHAPE_XMIN_SECONDS,
  EXPECTED_SHAPE,
  STEP_SIZE_TOLERANCE,
  boutKindShape,
  type BoutKind,
  type BoutKindShape,
  EXPONENTIAL_SHAPE_RANGE,
  MIN_BOUTS,
  SIGNIFICANCE,
  distributionDistance,
  fallingOnlyWhenPooled,
  survivalCurve,
  testBoutShape,
  type BoutShapeTest,
  type BoutShapeVerdict,
  type SurvivalCurve,
} from "./boutShapes";
export {
  BASELINE_FORM,
  baselineCurve,
  baselineSurvival,
  curveDistance,
  empiricalSurvival,
  fitBaselineToCurve,
  fitBaselineToDurations,
  type BaselineParameters,
} from "./baseline";
export { targetBaselines, type BoutBaseline } from "./targetBaselines";
