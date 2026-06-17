import React from 'react';
import { cn } from '@/lib/utils';

interface NoModsFoundProps extends React.HTMLAttributes<HTMLDivElement> {
  onInstallClick?: () => void;
}

const NoModsFound = React.forwardRef<HTMLDivElement, NoModsFoundProps>(
  ({ className, onInstallClick, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('w-full flex flex-col items-center justify-center py-4', className)}
        {...props}
      >
        <svg
          className="w-32 md:w-40 text-pink-500 opacity-30"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 860.13137 571.14799"
        >
          <path
            d="M605.66974,324.95306c-7.66934-12.68446-16.7572-26.22768-30.98954-30.36953-16.482-4.7965-33.4132,4.73193-47.77473,14.13453a1392.15692,1392.15692,0,0,0-123.89338,91.28311l.04331.49238q46.22556-3.1878,92.451-6.37554c22.26532-1.53546,45.29557-3.2827,64.97195-13.8156,7.46652-3.99683,14.74475-9.33579,23.20555-9.70782,10.51175-.46217,19.67733,6.87923,26.8802,14.54931,42.60731,45.371,54.937,114.75409,102.73817,154.61591A1516.99453,1516.99453,0,0,0,605.66974,324.95306Z"
            transform="translate(-169.93432 -164.42601)"
            fill="#f2f2f2"
          />
          <path
            d="M867.57068,709.78146c-4.71167-5.94958-6.6369-7.343-11.28457-13.34761q-56.7644-73.41638-106.70791-151.79237-33.92354-53.23-64.48275-108.50439-14.54864-26.2781-28.29961-52.96872-10.67044-20.6952-20.8646-41.63793c-1.94358-3.98782-3.8321-7.99393-5.71122-12.00922-4.42788-9.44232-8.77341-18.93047-13.43943-28.24449-5.31686-10.61572-11.789-21.74485-21.55259-28.877a29.40493,29.40493,0,0,0-15.31855-5.89458c-7.948-.51336-15.28184,2.76855-22.17568,6.35295-50.43859,26.301-97.65922,59.27589-140.3696,96.79771A730.77816,730.77816,0,0,0,303.32241,496.24719c-1.008,1.43927-3.39164.06417-2.37419-1.38422q6.00933-8.49818,12.25681-16.81288A734.817,734.817,0,0,1,500.80465,303.06436q18.24824-11.82581,37.18269-22.54245c6.36206-3.60275,12.75188-7.15967,19.25136-10.49653,6.37146-3.27274,13.13683-6.21547,20.41563-6.32547,24.7701-.385,37.59539,27.66695,46.40506,46.54248q4.15283,8.9106,8.40636,17.76626,16.0748,33.62106,33.38729,66.628,10.68453,20.379,21.83683,40.51955,34.7071,62.71816,73.77854,122.897c34.5059,53.1429,68.73651,100.08874,108.04585,149.78472C870.59617,709.21309,868.662,711.17491,867.57068,709.78146Z"
            transform="translate(-169.93432 -164.42601)"
            fill="#e4e4e4"
          />
          <circle cx="649.24878" cy="51" r="51" fill="currentColor" />
        </svg>

        <div className="flex flex-col items-center justify-center mt-3">
          <p className="text-lg md:text-xl text-white/50 font-serif italic">
            No Mods Found
          </p>
          <p className="text-xs text-white/30 mt-1">
            Add mods to enhance your gameplay
          </p>

          {onInstallClick && (
            <button
              onClick={onInstallClick}
              className="flex items-center space-x-2 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 mt-4 rounded-xl transition-all duration-200 font-medium text-xs"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Install Mod</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);

NoModsFound.displayName = 'NoModsFound';

export { NoModsFound };
