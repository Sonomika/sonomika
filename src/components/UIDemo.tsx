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
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ScrollArea,
  Slider,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui';
import { useToast } from '../hooks/use-toast';

interface UIDemoProps {
  onClose?: () => void;
}

export const UIDemo: React.FC<UIDemoProps> = ({ onClose }) => {
  const [progress, setProgress] = useState(13);
  const [checked, setChecked] = useState(false);
  const [switchValue, setSwitchValue] = useState(false);
  const [textareaValue, setTextareaValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('option1');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogWithCloseOpen, setDialogWithCloseOpen] = useState(false);
  const [demoColor, setDemoColor] = useState('#00aaff');
  const [tabValue, setTabValue] = useState('account');
  const [sliderValue, setSliderValue] = useState<number[]>([25]);
  const { toast } = useToast();

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
              <Button onClick={onClose} variant="outline" className="tw-text-neutral-100">
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
                <Button className="!tw-bg-neutral-700 !tw-text-neutral-100">Default Button</Button>
                <Button variant="secondary" className="tw-bg-neutral-600 tw-text-neutral-100">Secondary</Button>
                <Button variant="outline" className="tw-bg-neutral-950 tw-text-neutral-100 tw-border tw-border-neutral-700">Outline</Button>
                <Button variant="ghost" className="tw-bg-neutral-500 tw-text-neutral-100">Ghost</Button>
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
                    { value: 'option4', label: 'Option 4 - Set Effect' }
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
                  <Button variant="outline" className="tw-bg-neutral-900 tw-text-neutral-100">Hover me for tooltip</Button>
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
              
              <div className="tw-flex tw-gap-2 tw-flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="tw-bg-neutral-900 tw-text-neutral-100">Open Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent className="tw-text-xs">This is a small popover with content.</PopoverContent>
                </Popover>

                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({ title: 'Notification', description: 'This is a toast message.' })
                  }
                >
                  Show Toast
                </Button>
                
                <Button variant="ghost" onClick={() => setDialogOpen(true)}>Open Dialog</Button>
              </div>
            </CardContent>
          </Card>

          {/* Dialog Example */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="tw-text-sm">Example Dialog</DialogTitle>
                <DialogDescription className="tw-text-xs">This is a simple dialog using shadcn/ui components.</DialogDescription>
              </DialogHeader>
              <div className="tw-text-xs">Put dialog content here.</div>
              <div className="tw-flex tw-justify-end">
                <Button onClick={() => setDialogOpen(false)}>Close</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Color Picker & Dialog Close */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Color Picker & Close Icon</CardTitle>
              <CardDescription className="tw-text-xs">Native color input styled + dialog with close icon</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <div className="tw-flex tw-items-center tw-gap-3">
                <label className="tw-text-xs">Pick color:</label>
                <input
                  type="color"
                  value={demoColor}
                  onChange={(e) => setDemoColor(e.target.value)}
                  className="tw-w-12 tw-h-8 tw-border tw-border-neutral-700 tw-rounded"
                />
                <span className="tw-text-xs tw-text-neutral-400">{demoColor}</span>
              </div>
              <Button onClick={() => setDialogWithCloseOpen(true)} className="tw-w-fit">Open dialog with close icon</Button>
              <Dialog open={dialogWithCloseOpen} onOpenChange={setDialogWithCloseOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="tw-text-sm">Dialog With Close Icon</DialogTitle>
                    <DialogDescription className="tw-text-xs">Top-right “X” is provided by our Dialog component.</DialogDescription>
                  </DialogHeader>
                  <div className="tw-text-xs">This dialog demonstrates the built-in close button.</div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Tabs and Slider */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Tabs & Slider</CardTitle>
              <CardDescription className="tw-text-xs">Navigation with tabs and a value slider</CardDescription>
            </CardHeader>
            <CardContent className="tw-space-y-4">
              <Tabs value={tabValue} onValueChange={setTabValue as any}>
                <TabsList>
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="account" className="tw-text-xs">Account content goes here.</TabsContent>
                <TabsContent value="settings" className="tw-text-xs">Settings content goes here.</TabsContent>
              </Tabs>
              <div className="tw-space-y-2">
                <Label className="tw-text-xs">Intensity ({sliderValue[0]}%)</Label>
                <Slider value={sliderValue} onValueChange={setSliderValue} max={100} step={1} className="tw-w-[240px]" />
              </div>
            </CardContent>
          </Card>

          {/* Scroll Area & Context Menu */}
          <Card>
            <CardHeader>
              <CardTitle className="tw-text-sm">Scroll Area & Context Menu</CardTitle>
              <CardDescription className="tw-text-xs">Scrollable content and right-click menu</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
                <ScrollArea className="tw-h-32 tw-w-full tw-border tw-border-neutral-800 tw-p-2">
                  <div className="tw-space-y-2 tw-text-xs">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i}>Scrollable line {i + 1}</div>
                    ))}
                  </div>
                </ScrollArea>

                <ContextMenu>
                  <ContextMenuTrigger>
                    <div className="tw-h-32 tw-w-full tw-border tw-border-dashed tw-border-neutral-700 tw-flex tw-items-center tw-justify-center tw-text-xs">
                      Right click here
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="tw-text-xs">
                    <ContextMenuItem>New</ContextMenuItem>
                    <ContextMenuItem>Copy</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>Delete</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default UIDemo;
