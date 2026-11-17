import { createContext, useContext } from 'react';

export const remoteLabelDefaults = {
  imageLoading: 'Finding images…', imageFailed: 'Images are temporarily unavailable.',
  imageSource: 'Image source', previousImage: 'Previous image', nextImage: 'Next image', retry: 'Try again',
  map: 'Map', mapLoading: 'Loading map…', mapUnavailable: 'Map tiles are unavailable. You can still select places below.',
  placesUnavailable: 'Some places could not be located. Include the city or provide verified coordinates.',
  filterPlaces: 'Filter places', allPlaces: 'All places', recenter: 'Show every place',
  routeLoading: 'Finding the street route…', routeReady: 'Street route loaded.',
  routeUnavailable: 'Street routing is unavailable. Only the places are shown.',
  routeDriving: 'Driving route overview from OSRM / OpenStreetMap; not walking or turn-by-turn directions.',
};
export const RemoteLabels = createContext(remoteLabelDefaults);
export const useRemoteLabels = () => useContext(RemoteLabels);
