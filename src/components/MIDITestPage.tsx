import React from 'react';
import { MIDIMapper } from './MIDIMapper';

export const MIDITestPage: React.FC = () => {
	return (
		<div className="tw-h-screen tw-bg-black tw-text-white tw-p-5 tw-flex tw-flex-col">
			<h1 className="tw-mb-5 tw-text-xl tw-font-semibold">MIDI Mapper Test</h1>
			<div className="tw-flex-1 tw-border tw-border-neutral-800 tw-rounded">
				<MIDIMapper />
			</div>
		</div>
	);
}; 