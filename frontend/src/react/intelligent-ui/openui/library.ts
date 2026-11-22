import { Rayleigh } from './Rayleigh';
import { Simulation } from './Simulation';
import { Calculator } from './Calculator';
import { Visualization } from './Visualization';
import { SearchImage } from './SearchImage';
import { MapView, MapMarker } from './map/Map';
import { createLibrary } from '@openuidev/react-lang';
import { Box, Card, Col, Disclosure, Divider, Form, Grid, Row, Spacer } from './layout';
import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  NumberField,
  RadioGroup,
  SegmentedControl,
  Select,
  Slider,
  TextArea,
  Timer,
} from './controls';
import {
  Badge,
  Caption,
  Carousel,
  Flashcard,
  Image,
  Label,
  Link,
  Table,
  Text,
  Title,
} from './content';
import { Chart } from './chart';
import { ComparisonBars, Meter, Metric } from './metrics';
import { StepPlayer } from './playback';
import { ViewSwitcher } from './ViewSwitcher';
import { svgComponents } from './svg';
import { functions } from './functions';

/** Curated Open Intelligent UI primitives. All model output stays declarative. */
export const library = createLibrary({
  root: 'Col',
  components: [
    Rayleigh,
    Simulation,
    Calculator,
    Visualization,
    Col,
    Row,
    Box,
    Grid,
    Card,
    Disclosure,
    ViewSwitcher,
    Divider,
    Spacer,
    Form,
    Button,
    Checkbox,
    DatePicker,
    Input,
    NumberField,
    RadioGroup,
    SegmentedControl,
    Select,
    Slider,
    TextArea,
    Timer,
    StepPlayer,
    Badge,
    Caption,
    Carousel,
    Flashcard,
    Image,
    Label,
    Link,
    Table,
    Text,
    Title,
    Chart,
    Metric,
    Meter,
    ComparisonBars,
    SearchImage,
    MapView,
    MapMarker,
    ...svgComponents,
  ],
  functions,
  componentGroups: [
    {
      name: 'Layout',
      components: [
        'Col',
        'Row',
        'Box',
        'Grid',
        'Card',
        'Disclosure',
        'ViewSwitcher',
        'Carousel',
        'Divider',
        'Spacer',
        'Form',
      ],
      notes: [
        'gap/padding use 4px steps. Prefer compact, borderless article-like composition: group related controls directly above their chart, avoid nesting Cards, repeated headings and decorative Dividers. Card is a borderless semantic group; use its soft variant only when separation matters. Use default spacing or gap=2 for closely related controls. Use semantic colors: ink, muted, faint, surface, info, success, warning, danger, purple, pink, chart1 through chart6.',
        'Place headings and explanatory paragraphs in Col, not side by side in Row. Row wraps by default. Grid uses up to the requested columns and reflows below its default 180px minimum child width; minChildWidth=0 is only for deliberately compact grids such as keypads.',
        'Keep essential results in view. Put supporting derivations or assumptions in a single Disclosure; avoid nested disclosures.',
        'Use ViewSwitcher to compare alternative presentations of the same subject. Example: ViewSwitcher("Representation", [{id:"chart",label:"Graph",children:[plot]},{id:"table",label:"Data",children:[measurements]}]).',
      ],
    },
    {
      name: 'Dashboard',
      components: ['Metric', 'Meter', 'ComparisonBars', 'Visualization', 'Table'],
      notes: [
        'Use Grid with Metric cards for summaries, Meter for values with known bounds, and Visualization for trends or comparisons. Bind derived values to the same state as the chart. Example: root = Col([Slider($done, 0, 12, 1, "Tasks completed"), Meter("Tasks", $done, 12), Metric("Remaining", 12 - $done)]). Declare $done = 4 on the next line.',
        'Use ComparisonBars to scan a short list of measurements on the same zero-based scale. Example: ComparisonBars([{label:"Actual",value:$hours},{label:"Target",value:8}],"h",12).',
        'Enable Table sorting for ranked or exploratory data with Table(columns, rows, caption, true). Pass numbers as numbers for numeric ordering. Leave sorting off for prose-like tables or fixed sequences.',
      ],
    },
    {
      name: 'Inputs',
      components: [
        'Button',
        'Checkbox',
        'DatePicker',
        'Input',
        'NumberField',
        'RadioGroup',
        'SegmentedControl',
        'Select',
        'Slider',
        'TextArea',
        'Timer',
        'StepPlayer',
      ],
      notes: [
        'The first input argument binds to a $state variable. Every control must update a displayed result or submit a Form with @ToAssistant.',
        'Use Slider to explore a range and NumberField to enter exact values. Example: NumberField($hours,"Hours",0,12,0.25). Start with the single input most useful to the reader.',
        'Use StepPlayer for discrete frames of a worked example. Initialize $step = 0 and derive quantities by indexing an array, such as Metric("Active value", [2, 4, 8][$step]). StepPlayer($step, ["Start","Double","Double again"], "Worked example", 1500) gives manual stepping and optional playback.',
      ],
    },
  ],
});
