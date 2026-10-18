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
  components: [Col, Row, Box, Grid, Card, Divider, Spacer, Form, Button, Checkbox, DatePicker, Input, RadioGroup, SegmentedControl, Select, Slider, TextArea, Timer, Badge, Caption, Carousel, Flashcard, Image, Label, Link, Table, Text, Title, Chart, SearchImage, MapView, MapMarker, ...svgComponents],
  functions,
  componentGroups: [
    { name: 'Layout', components: ['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Divider', 'Spacer', 'Form'], notes: ['gap/padding use 4px steps. Use semantic colors: ink, muted, faint, surface, info, success, warning, danger, purple, pink, chart1 through chart6.'] },
    { name: 'Inputs', components: ['Button', 'Checkbox', 'DatePicker', 'Input', 'RadioGroup', 'SegmentedControl', 'Select', 'Slider', 'TextArea', 'Timer'], notes: ['The first input argument binds to a $state variable. Every control must update a displayed result or submit a Form with @ToAssistant.'] },
  ],
});
