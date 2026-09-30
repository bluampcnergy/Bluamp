
import type { ReceivedGood, Recipe, WIPItem, FinishedGood, CompanyProfile } from './types';
import { ReceivedGoodStatus } from './types';

export const DUMMY_RECEIVED_GOODS: ReceivedGood[] = [];

export const DUMMY_RECIPES: Recipe[] = [];

export const DUMMY_WIP_ITEMS: WIPItem[] = [];

export const DUMMY_FINISHED_GOODS: FinishedGood[] = [];

export const DUMMY_COMPANY_PROFILES: CompanyProfile[] = [
    {
        id: 'comp-1',
        name: 'VoltSupply Co.',
        gstNumber: '27AABCU9603R1ZM',
        shippingAddress: '123 Battery Lane, Power City, MH 400001',
        email: 'sales@voltsupply.com',
        contactPerson: 'Rajesh Kumar',
        phoneNumber: '+91 98765 43210'
    },
    {
        id: 'comp-2',
        name: 'ElectroCars India',
        gstNumber: '29AAECI1234F1Z5',
        shippingAddress: '456 EV Park, Banglore, KA 560100',
        email: 'procurement@electrocars.in',
        contactPerson: 'Anita Singh',
        phoneNumber: '+91 99887 76655'
    }
];
