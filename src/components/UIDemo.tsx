import React, { useState } from 'react';
import { 
  Button, 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle,
  Checkbox,
  Switch,
  Textarea,
  Badge,
  Progress,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Input,
  Label,
  Select
} from './ui';

interface UIDemoProps {
  onClose?: () => void;
}

export const UIDemo: React.FC<UIDemoProps> = ({ onClose }) => {
  const [progress, setProgress] = useState(13);
  const [checked, setChecked] = useState(false);
  const [switchValue, setSwitchValue] = useState(false);
  const [textareaValue, setTextareaValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('option1');

  return (
    <TooltipProvider>
      <div className="tw-h-full tw-overflow-y-auto tw-overflow-x-hidden">
        <div className="tw-p-6 tw-space-y-6 tw-max-w-4xl tw-mx-auto tw-min-h-full">
          <div className="tw-flex tw-justify-between tw-items-center">
            <div>
              <h1 className="tw-text-3xl tw-font-bold tw-mb-2">shadcn/ui Components Demo</h1>
              <p className="tw-text-muted-foreground tw-text-sm">Showcasing the new UI components in your VJ app</p>
            </div>
            {onClose && (
              <Button onClick={onClose} variant="outline">
                Back to App
              </Button>
            )}
          </div>

          {/* Basic Components */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Basic Components</CardTitle>
              <CardDescription className="tw-text-xs">Essential UI elements</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <div className="tw-flex tw-flex-wrap tw-gap-2">
                <Button>Default Button</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
              
              <div className="tw-space-y-2">
                <Label htmlFor="email" className="tw-text-xs">Email</Label>
                <Input id="email" placeholder="Enter your email" className="tw-text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* Form Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Form Controls</CardTitle>
              <CardDescription className="tw-text-xs">Interactive form elements</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <div className="tw-flex tw-items-center tw-space-x-2">
                <Checkbox
                  id="solo"
                  checked={checked}
                  onCheckedChange={(value) => setChecked(value === true)}
                />
                <Label htmlFor="solo" className="tw-text-xs">Solo Layer</Label>
              </div>
              
              <div className="tw-flex tw-items-center tw-space-x-2">
                <Switch
                  id="airplane-mode"
                  checked={switchValue}
                  onCheckedChange={setSwitchValue}
                />
                <Label htmlFor="airplane-mode" className="tw-text-xs">Airplane Mode</Label>
              </div>
              
              <div className="tw-space-y-2">
                <Label htmlFor="message" className="tw-text-xs">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Type your message here..."
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                  className="tw-text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Dropdowns and Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Dropdowns & Selection</CardTitle>
              <CardDescription className="tw-text-xs">Selection and dropdown components</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <div className="tw-space-y-2">
                <Label htmlFor="dropdown-demo" className="tw-text-xs">Select an Option</Label>
                <Select
                  value={selectedOption}
                  onChange={setSelectedOption}
                  options={[
                    { value: 'option1', label: 'Option 1 - Basic Effect' },
                    { value: 'option2', label: 'Option 2 - Advanced Effect' },
                    { value: 'option3', label: 'Option 3 - Custom Effect' },
                    { value: 'option4', label: 'Option 4 - Preset Effect' }
                  ]}
                  placeholder="Choose an option"
                  className="tw-w-[200px]"
                />
                <p className="tw-text-xs tw-text-neutral-400">
                  Selected: {selectedOption}
                </p>
              </div>
              
              <div className="tw-space-y-2">
                <Label className="tw-text-xs">Dropdown Variants</Label>
                <div className="tw-flex tw-gap-2 tw-flex-wrap">
                  <Select
                    value=""
                    onChange={() => {}}
                    options={[
                      { value: 'small', label: 'Small' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'large', label: 'Large' }
                    ]}
                    placeholder="Size"
                    className="tw-w-[150px]"
                  />
                  
                  <Select
                    value=""
                    onChange={() => {}}
                    options={[
                      { value: 'dark', label: 'Dark' },
                      { value: 'light', label: 'Light' },
                      { value: 'auto', label: 'Auto' }
                    ]}
                    placeholder="Theme"
                    className="tw-w-[150px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Display */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Data Display</CardTitle>
              <CardDescription className="tw-text-xs">Components for showing information</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <div className="tw-flex tw-flex-wrap tw-gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
              
              <div className="tw-space-y-2">
                <div className="tw-flex tw-justify-between tw-text-xs">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="tw-w-full" />
              </div>
              
              <Separator />
              
              <div className="tw-text-xs tw-text-muted-foreground">
                This is a separator line above this text.
              </div>
            </CardContent>
          </Card>

          {/* Interactive Elements */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Interactive Elements</CardTitle>
              <CardDescription className="tw-text-xs">Hover and click interactions</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hover me for tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="tw-text-xs">This is a helpful tooltip!</p>
                </TooltipContent>
              </Tooltip>
              
              <Alert>
                <AlertTitle className="tw-text-sm">Heads up!</AlertTitle>
                <AlertDescription className="tw-text-xs">
                  You can add components and dependencies to your app using the cli.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default UIDemo;
