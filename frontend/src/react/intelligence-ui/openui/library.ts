import { Simulation } from './Simulation';
import { Calculator } from './Calculator';
import { Visualization } from './Visualization';
import { SearchImage } from './SearchImage';
import { MapView, MapMarker } from './map/Map';
import { createLibrary } from '@openuidev/react-lang';
import { Box, Card, Col, Divider, Form, Grid, Row, Spacer } from './layout';
import { Button, Checkbox, DatePicker, Input, RadioGroup, SegmentedControl, Select, Slider, TextArea, Timer } from './controls';
import { Badge, Caption, Carousel, Flashcard, Image, Label, Link, Table, Text, Title } from './content';
import { Chart } from './chart';
import { svgComponents } from './svg';
import { functions } from './functions';

/** Curated Open Intelligent UI primitives. All model output stays declarative. */
export const library = createLibrary({
  root: 'Col',
  components: [Simulation, Calculator, Visualization, Col, Row, Box, Grid, Card, Divider, Spacer, Form, Button, Checkbox, DatePicker, Input, RadioGroup, SegmentedControl, Select, Slider, TextArea, Timer, Badge, Caption, Carousel, Flashcard, Image, Label, Link, Table, Text, Title, Chart, SearchImage, MapView, MapMarker, ...svgComponents],
  functions,
  componentGroups: [
    { name: 'Layout', components: ['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Divider', 'Spacer', 'Form'], notes: ['gap/padding use 4px steps. Prefer compact, borderless article-like composition: group related controls directly above their chart, avoid nesting Cards, repeated headings and decorative Dividers. Card is a borderless semantic group; use its soft variant only when separation matters. Use default spacing or gap=2 for closely related controls. Use semantic colors: ink, muted, faint, surface, info, success, warning, danger, purple, pink, chart1 through chart6.', 'Place headings and explanatory paragraphs in Col, not side by side in Row. Row wraps by default. Grid uses up to the requested columns and reflows below its default 180px minimum child width; minChildWidth=0 is only for deliberately compact grids such as keypads.'] },
    { name: 'Inputs', components: ['Button', 'Checkbox', 'DatePicker', 'Input', 'RadioGroup', 'SegmentedControl', 'Select', 'Slider', 'TextArea', 'Timer'], notes: ['The first input argument binds to a $state variable. Every control must update a displayed result or submit a Form with @ToAssistant.'] },
  ],
});
