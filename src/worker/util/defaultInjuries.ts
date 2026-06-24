// See data/injuries.ods for basketball data

import { isSport } from "../../common/index.ts";
import helpers from "./helpers.ts";

let defaultInjuries: {
	name: string;
	frequency: number;
	games: number;
}[];

if (isSport("hockey")) {
	// https://discord.com/channels/@me/778760871911751700/1340867968325652480
	defaultInjuries = [
		{
			name: "Torn ACL",
			frequency: 38,
			games: 100,
		},
		{
			name: "Torn Achilles Tendon",
			frequency: 10,
			games: 100,
		},
		{
			name: "Fractured Neck",
			frequency: 1,
			games: 100,
		},
		{
			name: "Dislocated Knee",
			frequency: 2,
			games: 100,
		},
		{
			name: "Fractured Leg",
			frequency: 19,
			games: 80,
		},
		{
			name: "Torn MCL",
			frequency: 17,
			games: 60,
		},
		{
			name: "Torn PCL",
			frequency: 4,
			games: 60,
		},
		{
			name: "Torn Calf",
			frequency: 12,
			games: 45,
		},
		{
			name: "Fractured Kneecap",
			frequency: 8,
			games: 42,
		},
		{
			name: "Torn Bicep",
			frequency: 6,
			games: 40,
		},
		{
			name: "Fractured Arm",
			frequency: 11,
			games: 35,
		},
		{
			name: "Torn Tricep",
			frequency: 8,
			games: 31,
		},
		{
			name: "Fractured Orbital Socket",
			frequency: 1,
			games: 30,
		},
		{
			name: "Torn Meniscus",
			frequency: 68,
			games: 25.4,
		},
		{
			name: "Fractured Ankle",
			frequency: 28,
			games: 24.2,
		},
		{
			name: "Broken Collarbone",
			frequency: 12,
			games: 21.6,
		},
		{
			name: "Heart Attack",
			frequency: 0.01,
			games: 20.5,
		},
		{
			name: "Fractured Foot",
			frequency: 111,
			games: 20.46,
		},
		{
			name: "High Ankle Sprain",
			frequency: 54,
			games: 20.3,
		},
		{
			name: "Concussion",
			frequency: 186,
			games: 20,
		},
		{
			name: "Herniated Disc",
			frequency: 67,
			games: 19.55,
		},
		{
			name: "Fractured Cheekbone",
			frequency: 1,
			games: 18.5,
		},
		{
			name: "Fractured Wrist",
			frequency: 128,
			games: 18.38,
		},
		{
			name: "Dislocated Shoulder",
			frequency: 79,
			games: 17,
		},
		{
			name: "Fractured Jaw",
			frequency: 23,
			games: 15.7,
		},
		{
			name: "Fractured Hand",
			frequency: 114,
			games: 13.8,
		},
		{
			name: "Skate to Face",
			frequency: 1,
			games: 11,
		},
		{
			name: "Fractured Tailbone",
			frequency: 11,
			games: 11,
		},
		{
			name: "Torn Groin",
			frequency: 13,
			games: 9.6,
		},
		{
			name: "Sprained Knee",
			frequency: 288,
			games: 9.4,
		},
		{
			name: "Fractured Finger",
			frequency: 94,
			games: 8.79,
		},
		{
			name: "Fractured Thumb",
			frequency: 94,
			games: 8.79,
		},
		{
			name: "Fractured Toe",
			frequency: 106,
			games: 8.79,
		},
		{
			name: "Ruptured Eshophagus",
			frequency: 1,
			games: 7,
		},
		{
			name: "Sprained Shoulder",
			frequency: 224,
			games: 6.01,
		},
		{
			name: "Sprained Foot",
			frequency: 158,
			games: 5.4,
		},
		{
			name: "Bone Bruise",
			frequency: 7,
			games: 5.3,
		},
		{
			name: "Broken Ribs",
			frequency: 183,
			games: 4.53,
		},
		{
			name: "Plantar Fasciitis",
			frequency: 64,
			games: 3.81,
		},
		{
			name: "Sprained Wrist",
			frequency: 755,
			games: 3.8,
		},
		{
			name: "Strained Hamstring",
			frequency: 684,
			games: 3.2,
		},
		{
			name: "Strained Calf",
			frequency: 503,
			games: 3.1,
		},
		{
			name: "Back Spasms",
			frequency: 327,
			games: 3.06,
		},
		{
			name: "Strained Abdomen",
			frequency: 65,
			games: 3.01,
		},
		{
			name: "Strained Rotator Cuff",
			frequency: 74,
			games: 2.9,
		},
		{
			name: "Strained Quadriceps",
			frequency: 119,
			games: 2.61,
		},
		{
			name: "Strained Bicep",
			frequency: 91,
			games: 2.4,
		},
		{
			name: "Strained Tricep",
			frequency: 92,
			games: 2.4,
		},
		{
			name: "Bruised Knee",
			frequency: 1098,
			games: 2.15,
		},
		{
			name: "Fractured Nose",
			frequency: 51,
			games: 2.01,
		},
		{
			name: "Seizure",
			frequency: 0.01,
			games: 1.9,
		},
		{
			name: "Illness",
			frequency: 10,
			games: 1.8,
		},
		{
			name: "Bruised Tailbone",
			frequency: 54,
			games: 1.5,
		},
		{
			name: "Strained Foot",
			frequency: 94,
			games: 1.47,
		},
		{
			name: "Strained Groin",
			frequency: 309,
			games: 1.42,
		},
		{
			name: "Bruised Quadriceps",
			frequency: 403,
			games: 1.41,
		},
		{
			name: "Strained Shoulder",
			frequency: 175,
			games: 1.4,
		},
		{
			name: "Strained Hip Flexor",
			frequency: 107,
			games: 1.3,
		},
		{
			name: "Whiplash",
			frequency: 469,
			games: 1.3,
		},
		{
			name: "Facial Laceration",
			frequency: 208,
			games: 1.3,
		},
		{
			name: "Strained Neck",
			frequency: 154,
			games: 1.21,
		},
		{
			name: "Bruised Back",
			frequency: 884,
			games: 1,
		},
		{
			name: "Bruised Shoulder",
			frequency: 354,
			games: 1,
		},
		{
			name: "Bruised Foot",
			frequency: 1399,
			games: 0.9,
		},
		{
			name: "Bruised Elbow",
			frequency: 345,
			games: 0.9,
		},
		{
			name: "Bruised Leg",
			frequency: 1792,
			games: 0.8,
		},
		{
			name: "Bruised Hip",
			frequency: 688,
			games: 0.8,
		},
		{
			name: "Throat Contusion",
			frequency: 42,
			games: 0.8,
		},
		{
			name: "Sprained Finger",
			frequency: 405,
			games: 0.56,
		},
		{
			name: "Sprained Thumb",
			frequency: 329,
			games: 0.56,
		},
		{
			name: "Sprained Ankle",
			frequency: 183,
			games: 0.54,
		},
		{
			name: "Bruised Ribs",
			frequency: 726,
			games: 0.4,
		},
		{
			name: "Bruised Eye",
			frequency: 63,
			games: 0.32,
		},
		{
			name: "Fractured Tooth",
			frequency: 90,
			games: 0.23,
		},
		{
			name: "Bruised Hand",
			frequency: 1189,
			games: 0.2,
		},
	];
} else {
	defaultInjuries = [
		{
			name: "Sprained Ankle",
			frequency: 1520,
			games: 7.1,
		},
		{
			name: "Knee Soreness",
			frequency: 809,
			games: 7.24,
		},
		{
			name: "Back Soreness",
			frequency: 566,
			games: 4.6,
		},
		{
			name: "Strained Hamstring",
			frequency: 529,
			games: 9.58,
		},
		{
			name: "Strained Calf",
			frequency: 454,
			games: 9.82,
		},
		{
			name: "Ankle Soreness",
			frequency: 375,
			games: 4.51,
		},
		{
			name: "Strained Groin",
			frequency: 354,
			games: 5.82,
		},
		{
			name: "Foot Soreness",
			frequency: 305,
			games: 6.97,
		},
		{
			name: "Hip Soreness",
			frequency: 302,
			games: 5.99,
		},
		{
			name: "Bruised Knee",
			frequency: 261,
			games: 6.76,
		},
		{
			name: "Sprained Knee",
			frequency: 248,
			games: 14.07,
		},
		{
			name: "Concussion",
			frequency: 198,
			games: 4.19,
		},
		{
			name: "Achilles Soreness",
			frequency: 182,
			games: 4.51,
		},
		{
			name: "Back Spasms",
			frequency: 168,
			games: 3.81,
		},
		{
			name: "Bruised Hip",
			frequency: 160,
			games: 3.17,
		},
		{
			name: "Shoulder Soreness",
			frequency: 150,
			games: 7.72,
		},
		{
			name: "Bruised Quadriceps",
			frequency: 145,
			games: 3.9,
		},
		{
			name: "Patellar Tendinitis",
			frequency: 145,
			games: 6.05,
		},
		{
			name: "Sprained Toe",
			frequency: 130,
			games: 7.87,
		},
		{
			name: "Sprained Foot",
			frequency: 120,
			games: 7.74,
		},
		{
			name: "Bruised Leg",
			frequency: 116,
			games: 3.65,
		},
		{
			name: "Sprained Wrist",
			frequency: 114,
			games: 8.89,
		},
		{
			name: "Bruised Back",
			frequency: 111,
			games: 5.49,
		},
		{
			name: "Sprained Thumb",
			frequency: 103,
			games: 6.1,
		},
		{
			name: "Sprained Shoulder",
			frequency: 89,
			games: 9.04,
		},
		{
			name: "Plantar Fasciitis",
			frequency: 86,
			games: 6.93,
		},
		{
			name: "Fractured Hand",
			frequency: 83,
			games: 18.03,
		},
		{
			name: "Bruised Foot",
			frequency: 79,
			games: 7.48,
		},
		{
			name: "Fractured Finger",
			frequency: 68,
			games: 13.04,
		},
		{
			name: "Quadriceps Soreness",
			frequency: 62,
			games: 4.43,
		},
		{
			name: "Bruised Hand",
			frequency: 50,
			games: 3.86,
		},
		{
			name: "Fractured Nose",
			frequency: 50,
			games: 6.88,
		},
		{
			name: "Strained Quadriceps",
			frequency: 50,
			games: 8.72,
		},
		{
			name: "Bruised Shoulder",
			frequency: 48,
			games: 7.76,
		},
		{
			name: "Elbow Soreness",
			frequency: 43,
			games: 7.61,
		},
		{
			name: "Strained Abdomen",
			frequency: 43,
			games: 11.17,
		},
		{
			name: "Torn ACL",
			frequency: 43,
			games: 160.0,
		},
		{
			name: "Sprained Elbow",
			frequency: 41,
			games: 8.74,
		},
		{
			name: "Wrist Soreness",
			frequency: 41,
			games: 7.55,
		},
		{
			name: "Fractured Ankle",
			frequency: 39,
			games: 34.18,
		},
		{
			name: "Fractured Foot",
			frequency: 39,
			games: 43.15,
		},
		{
			name: "Strained Neck",
			frequency: 39,
			games: 7.38,
		},
		{
			name: "Toe Soreness",
			frequency: 39,
			games: 1.95,
		},
		{
			name: "Torn Meniscus",
			frequency: 39,
			games: 36.75,
		},
		{
			name: "Hand Soreness",
			frequency: 37,
			games: 3.41,
		},
		{
			name: "Sprained Hand",
			frequency: 36,
			games: 7.98,
		},
		{
			name: "Strained Oblique",
			frequency: 36,
			games: 9.07,
		},
		{
			name: "Rib Contusion",
			frequency: 32,
			games: 3.51,
		},
		{
			name: "Sprained Finger",
			frequency: 32,
			games: 9.07,
		},
		{
			name: "Torn Achilles Tendon",
			frequency: 23,
			games: 144.25,
		},
		{
			name: "Neck Soreness",
			frequency: 22,
			games: 5.65,
		},
		{
			name: "Bruised Eye",
			frequency: 18,
			games: 0.47,
		},
		{
			name: "Fractured Rib",
			frequency: 18,
			games: 11.18,
		},
		{
			name: "Herniated Disc",
			frequency: 18,
			games: 23.37,
		},
		{
			name: "Thumb Soreness",
			frequency: 18,
			games: 5.77,
		},
		{
			name: "Bruised Elbow",
			frequency: 16,
			games: 1.3,
		},
		{
			name: "Ankle Contusion",
			frequency: 14,
			games: 6.02,
		},
		{
			name: "Fractured Toe",
			frequency: 9,
			games: 14.78,
		},
	];
}

// Hack for football
if (isSport("football")) {
	for (const row of defaultInjuries) {
		row.games = helpers.localeParseFloat((row.games / 3).toFixed(2));
	}
} else if (isSport("baseball")) {
	for (const row of defaultInjuries) {
		row.games *= 1.5;
	}
}

export default defaultInjuries;
